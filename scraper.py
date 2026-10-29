"""Polite crawler: obeys robots.txt + crawl-delay, same-domain only, page cap."""
import hashlib, json, re, time
import urllib.robotparser as rp
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

SITES = [  # (name, start_url, allowed_path_prefix)
    ("Dar Global", "https://darglobal.co.uk/", "/"),
    ("Wasalt", "https://wasalt.sa/en", "/en"),
]
UA = "FDE-Assignment-Bot/1.0 (educational project)"
MAX_PAGES = 40
SKIP_EXT = re.compile(r"\.(pdf|jpe?g|png|webp|gif|svg|mp4|zip|xml)$", re.I)


def host(u):
    return urlparse(u).netloc.removeprefix("www.")


def load_robots(c, base):
    r = rp.RobotFileParser()
    try:
        res = c.get(urljoin(base, "/robots.txt"))
        if res.status_code in (401, 403):
            r.parse(["User-agent: *", "Disallow: /"])
        else:
            r.parse(res.text.splitlines() if res.status_code == 200 else [])
    except httpx.HTTPError:
        r.parse([])
    return r


def sitemap_urls(c, robots, base, limit=10):
    queue, urls, fetched = list(robots.site_maps() or [urljoin(base, "/sitemap.xml")]), [], 0
    while queue and fetched < limit:
        sm = queue.pop(0)
        fetched += 1
        try:
            res = c.get(sm)
        except httpx.HTTPError:
            continue
        if res.status_code != 200:
            continue
        for loc in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", res.text):
            (queue if loc.endswith(".xml") else urls).append(loc)
    return urls


def extract(html):
    soup = BeautifulSoup(html, "html.parser")
    links = [a["href"] for a in soup.find_all("a", href=True)]
    for t in soup(["script", "style", "noscript", "svg", "iframe", "form"]):
        t.decompose()
    title = soup.title.get_text(strip=True) if soup.title else ""
    body = soup.body or soup
    return title, re.sub(r"\s+", " ", body.get_text(" ", strip=True)), links


def crawl(name, start, prefix):
    pages = []
    with httpx.Client(headers={"User-Agent": UA}, timeout=20, follow_redirects=True) as c:
        robots = load_robots(c, start)
        delay = max(1.0, float(robots.crawl_delay(UA) or 0))
        queue, seen = [start] + sitemap_urls(c, robots, start), set()
        while queue and len(pages) < MAX_PAGES:
            url = queue.pop(0).split("#")[0]
            if url in seen:
                continue
            seen.add(url)
            u = urlparse(url)
            if (host(url) != host(start) or not u.path.startswith(prefix)
                    or SKIP_EXT.search(u.path) or not robots.can_fetch(UA, url)):
                continue
            try:
                res = c.get(url)
            except httpx.HTTPError:
                continue
            finally:
                time.sleep(delay)
            if res.status_code != 200 or "text/html" not in res.headers.get("content-type", ""):
                continue
            title, text, links = extract(res.text)
            if len(text) > 200:
                pages.append({"site": name, "url": str(res.url), "title": title, "text": text})
                print(f"[{name}] {res.url}", flush=True)
            queue += [urljoin(str(res.url), l) for l in links]
    return pages


if __name__ == "__main__":
    chunks, seen = [], set()
    for name, start, prefix in SITES:
        try:
            pages = crawl(name, start, prefix)
        except Exception as e:  # one site failing shouldn't kill the whole build
            print(f"[{name}] crawl failed: {e}", flush=True)
            pages = []
        for p in pages:
            words = p["text"].split()
            for i in range(0, len(words), 180):  # 220-word chunks, 40 overlap
                text = " ".join(words[i:i + 220])
                h = hashlib.md5(text.encode()).hexdigest()
                if h in seen:  # drop repeated nav/footer chunks
                    continue
                seen.add(h)
                chunks.append({"site": p["site"], "url": p["url"], "title": p["title"], "text": text})

    out = Path("data/chunks.json")
    if not chunks and out.exists():
        print("Scrape returned nothing; keeping existing data/chunks.json")
    else:
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps(chunks, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Saved {len(chunks)} chunks")
