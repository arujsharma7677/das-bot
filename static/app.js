const $ = s => document.querySelector(s);
const log = $('#log'), form = $('#composer'), input = $('#q'), sendBtn = $('#send');
const welcome = $('#welcome'), counter = $('#count'), statusEl = $('#status'), dot = $('#dot');
const MAX = 1000;
let history = [], busy = false;

// Safe formatter: builds DOM nodes (never innerHTML) for **bold**, bullets and line breaks.
function richText(el, text) {
  String(text).split('\n').forEach((line, i) => {
    if (i) el.appendChild(document.createElement('br'));
    let l = line.replace(/^#{1,6}\s+/, '');
    const bullet = l.match(/^\s*[-*•]\s+(.*)/);
    if (bullet) l = '• ' + bullet[1];
    l.split(/(\*\*[^*]+\*\*)/g).forEach(part => {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        const b = document.createElement('strong');
        b.textContent = part.slice(2, -2);
        el.appendChild(b);
      } else if (part) {
        el.appendChild(document.createTextNode(part));
      }
    });
  });
}

function scrollDown() { log.scrollTop = log.scrollHeight; }

function addMessage(role, text, sources, isError) {
  welcome.hidden = true;
  const row = document.createElement('div');
  row.className = `msg ${role}${isError ? ' error' : ''}`;
  if (role === 'bot') {
    const av = document.createElement('div');
    av.className = 'avatar'; av.textContent = 'AI';
    row.appendChild(av);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'bot') richText(bubble, text); else bubble.textContent = text;

  if (sources && sources.length) {
    const box = document.createElement('div'); box.className = 'sources';
    const label = document.createElement('span'); label.textContent = 'Sources';
    box.appendChild(label);
    sources.forEach(s => {
      if (!/^https:\/\//i.test(s.url)) return; // only allow https links
      const a = document.createElement('a');
      a.className = 'src'; a.href = s.url; a.title = s.url;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      if (s.site) { const b = document.createElement('b'); b.textContent = s.site; a.appendChild(b); }
      const t = document.createElement('i'); t.textContent = s.title || s.url; a.appendChild(t);
      box.appendChild(a);
    });
    bubble.appendChild(box);
  }
  row.appendChild(bubble);
  log.appendChild(row);
  scrollDown();
  return row;
}

function showTyping() {
  const row = addMessage('bot', '');
  const wrap = document.createElement('span'); wrap.className = 'typing';
  for (let i = 0; i < 3; i++) wrap.appendChild(document.createElement('i'));
  row.querySelector('.bubble').appendChild(wrap);
  scrollDown();
  return row;
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}

function updateUI() {
  counter.textContent = `${input.value.length}/${MAX}`;
  sendBtn.disabled = busy || !input.value.trim();
}

async function send(text) {
  const q = text.trim();
  if (!q || busy) return;
  busy = true;
  input.value = ''; autosize(); updateUI();
  addMessage('user', q);
  const typing = showTyping();
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q, history: history.slice(-6) })
    });
    let j = {};
    try { j = await r.json(); } catch {}
    typing.remove();
    if (!r.ok) {
      const msg = r.status === 429 ? "You're sending messages too fast. Please wait a minute."
        : typeof j.detail === 'string' ? j.detail : 'Something went wrong. Please try again.';
      addMessage('bot', msg, null, true);
      return;
    }
    addMessage('bot', j.answer, j.sources);
    history.push({ role: 'user', content: q },
                 { role: 'assistant', content: String(j.answer).slice(0, 2000) });
    history = history.slice(-10);
  } catch {
    typing.remove();
    addMessage('bot', 'Network error. The server may be waking up, so please retry in a few seconds.', null, true);
  } finally {
    busy = false; updateUI(); input.focus();
  }
}

form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
input.addEventListener('input', () => { autosize(); updateUI(); });
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
});
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => send(c.dataset.q)));
$('#clear').addEventListener('click', () => {
  log.querySelectorAll('.msg').forEach(m => m.remove());
  history = []; welcome.hidden = false; input.focus();
});

(async function checkHealth() {
  try {
    const j = await (await fetch('/health')).json();
    dot.classList.add('ok');
    statusEl.textContent = `Online · ${j.chunks} knowledge chunks`;
  } catch {
    statusEl.textContent = 'Waking up… try again in a moment';
  }
})();

updateUI();
