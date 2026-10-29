# Dar Global & Wasalt AI Chatbot

FastAPI + BM25 retrieval + OpenRouter free models. Deploys free on Render.

## Deploy on Render (Web Service, Python)

1. Push this folder to a GitHub repo.
2. Render → **New → Web Service** → pick the repo → Language **Python 3** → Instance **Free**.

**Build Command**
```
pip install -r requirements.txt
```
(`data/chunks.json` is committed, so no scraping happens on Render.)

**Start Command**
```
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
```

**Health Check Path:** `/health`

**Environment Variables**

| Key | Value |
|---|---|
| `OPENROUTER_API_KEY` | your key from openrouter.ai → Keys |
| `OPENROUTER_MODELS` | `meta-llama/llama-3.3-70b-instruct:free,openrouter/free` |
| `RATE_LIMIT_PER_MIN` | `5` |
| `PYTHON_VERSION` | `3.12.7` |

(Or use **New → Blueprint**: `render.yaml` already has all of this; you only paste the API key.)

Check `https://<your-service>.onrender.com/health` → `{"status":"ok","chunks":N}` with N > 0.

## Run locally

```
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python scraper.py
export OPENROUTER_API_KEY=sk-or-...
uvicorn app.main:app --reload
```

Open http://localhost:8000

## Notes

- `data/chunks.json` ships empty; the build command fills it by scraping both sites.
  If the scrape on Render returns 0 chunks, run `python scraper.py` locally, commit the
  generated `data/chunks.json`, and change the build command to `pip install -r requirements.txt`.
- Free OpenRouter model IDs change. If every answer says "AI model is busy", check
  openrouter.ai/models (free filter) and update `OPENROUTER_MODELS`.
- Render free services sleep after 15 min idle; ping `/health` every 10 min with
  cron-job.org or UptimeRobot to keep it awake.
