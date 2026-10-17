// Listen page: join a live room and hear the speaker in your language.
// Polls the server for new lines, then plays them one after another.

import { LANGUAGES, DEFAULT_LANGUAGE, getLanguage } from "/languages.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const POLL_MS = 1000;
const WAIT_LINE_MS = 15000;   // give up on a line that never arrives
const WAIT_AUDIO_MS = 15000;  // fall back to the phone voice if audio is late

/* ---------- join screen ---------- */
let lang = pickInitialLanguage();
const grid = $("langGrid");
for (const [code, l] of Object.entries(LANGUAGES)) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lang-btn";
  b.dataset.code = code;
  b.setAttribute("role", "radio");
  b.innerHTML = `<span class="native" lang="${code}" dir="${l.dir}">${l.native}</span><span class="en">${l.name}</span>`;
  b.addEventListener("click", () => { lang = code; store.set("listenLang", code); renderLang(); });
  grid.appendChild(b);
}
renderLang();

function pickInitialLanguage() {
  const saved = store.get("listenLang");
  if (saved && LANGUAGES[saved]) return saved;
  const nav = (navigator.language || "").toLowerCase();
  for (const code of Object.keys(LANGUAGES)) if (nav.startsWith(code)) return code;
  return DEFAULT_LANGUAGE;
}

function t() { return getLanguage(lang).ui; }

function renderLang() {
  grid.querySelectorAll(".lang-btn").forEach((b) => {
    const on = b.dataset.code === lang;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  });
  $("startLabel").textContent = t().start;
  $("startLabel").lang = lang;
}

const params = new URLSearchParams(location.search);
$("code").value = (params.get("room") || store.get("listenRoom") || "").toUpperCase();
$("code").addEventListener("input", () => { $("code").value = $("code").value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });

$("startBtn").addEventListener("click", () => {
  const code = $("code").value.trim();
  if (!/^[A-Z0-9]{4,6}$/.test(code)) {
    showJoinError(t().notFound);
    $("code").focus();
    return;
  }
  unlockAudio();
  join(code);
});

function showJoinError(msg) {
  $("joinError").textContent = msg;
  $("joinError").hidden = !msg;
}

/* ---------- audio unlock (iPhone needs a tap first) ---------- */
const player = $("player");
const SILENT_WAV = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";
function unlockAudio() {
  try { player.src = SILENT_WAV; player.play().catch(() => {}); } catch {}
  try {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch {}
}

/* ---------- room state ---------- */
const S = {
  code: "", id: Math.random().toString(36).slice(2, 12),
  after: -1, after0: 0, next: 0, count: 0, ended: false, joined: false,
  lines: new Map(), firstSeen: new Map(), blobs: new Map(),
  playing: false, pollTimer: null, active: false, blocked: false,
};

async function join(code) {
  S.code = code; S.after = -1; S.lines.clear(); S.firstSeen.clear(); S.ended = false; S.joined = false;
  S.active = true;
  showJoinError("");
  $("startBtn").disabled = true;
  try {
    await pollOnce();
  } catch (e) {
    S.active = false;
    $("startBtn").disabled = false;
    showJoinError(e.message === "notFound" ? t().notFound : e.message === "tooManyLanguages"
      ? "This room already has 4 languages. / Esta sala ya tiene 4 idiomas."
      : e.message);
    return;
  }
  store.set("listenRoom", code);
  history.replaceState(null, "", `/listen?room=${code}`);
  $("join").hidden = true;
  $("room").hidden = false;
  $("captions").innerHTML = "";
  $("roomTag").textContent = `· ${code} · ${getLanguage(lang).native}`;
  $("keepOpen").textContent = t().keepOpen;
  $("keepOpen").lang = lang;
  $("keepOpen").dir = getLanguage(lang).dir;
  $("leaveBtn").textContent = t().leave;
  keepAwake();
  setStatus();
  schedulePoll();
}

$("leaveBtn").addEventListener("click", leave);
function leave() {
  S.active = false;
  clearTimeout(S.pollTimer);
  stopAudio();
  releaseAwake();
  $("room").hidden = true;
  $("join").hidden = false;
  $("startBtn").disabled = false;
}

/* ---------- polling ---------- */
async function pollOnce() {
  const q = new URLSearchParams({ action: "poll", code: S.code, lang, after: String(S.after), id: S.id });
  const resp = await fetch(`/api/room?${q}`, { cache: "no-store" });
  let data = {};
  try { data = await resp.json(); } catch {}
  if (!resp.ok) throw new Error(data.error || `Error ${resp.status}`);

  if (!S.joined) {
    S.joined = true;
    S.after = data.from;
    S.after0 = data.from; // lines that existed before we joined
    S.next = data.from + 1;
  }
  S.count = data.count;
  S.ended = data.ended;
  for (const line of data.lines || []) {
    S.lines.set(line.seq, line);
    if (!S.firstSeen.has(line.seq)) S.firstSeen.set(line.seq, Date.now());
    if (line.text && !S.firstSeen.has(`t${line.seq}`)) S.firstSeen.set(`t${line.seq}`, Date.now());
    if (line.audio === "ready") prefetch(line.seq);
  }
  // Ask from the line we're about to play, so pending lines get re-checked.
  S.after = Math.max(S.after, S.next - 1);
  tick();
  setStatus();
}

function schedulePoll() {
  clearTimeout(S.pollTimer);
  if (!S.active) return;
  if (S.ended && S.next > S.count && !S.playing) { setStatus(); return; }
  S.pollTimer = setTimeout(async () => {
    try { await pollOnce(); schedulePoll(); }
    catch (e) {
      if (e.message === "notFound") { S.ended = true; setStatus(); return; }
      S.pollTimer = setTimeout(schedulePoll, 2000);
    }
  }, POLL_MS);
}

/* ---------- playback queue ---------- */
async function prefetch(seq) {
  if (S.blobs.has(seq)) return S.blobs.get(seq);
  const p = fetch(`/api/room?${new URLSearchParams({ action: "audio", code: S.code, lang, seq: String(seq) })}`)
    .then((r) => (r.ok ? r.blob() : null))
    .catch(() => null);
  S.blobs.set(seq, p);
  return p;
}

function tick() {
  if (!S.active || S.playing || S.blocked) return;
  const seq = S.next;
  if (seq > S.count) { setStatus(); return; }
  const line = S.lines.get(seq);
  const seenAt = S.firstSeen.get(seq) || Date.now();
  if (!S.firstSeen.has(seq)) S.firstSeen.set(seq, seenAt);

  if (!line || line.pending) {
    if (Date.now() - seenAt > WAIT_LINE_MS) { S.next++; tick(); }
    return;
  }
  if (line.skip || line.error || !line.text) { S.next++; tick(); return; }

  if (line.audio === "ready") return playAudio(seq, line);
  if (line.audio === "pending" && Date.now() - (S.firstSeen.get(`t${seq}`) || seenAt) < WAIT_AUDIO_MS) return; // wait for the voice
  return playPhoneVoice(seq, line); // no cloned voice available → phone's own voice
}

async function playAudio(seq, line) {
  S.playing = true;
  addCaption(seq, line.text);
  const blob = await prefetch(seq);
  if (!S.active) return;
  if (!blob) { S.playing = false; return playPhoneVoice(seq, line); }
  const url = URL.createObjectURL(blob);
  player.src = url;
  player.onended = () => { URL.revokeObjectURL(url); S.blobs.delete(seq); done(); };
  player.onerror = () => { URL.revokeObjectURL(url); done(); };
  if (S.lines.has(seq + 1) && S.lines.get(seq + 1).audio === "ready") prefetch(seq + 1);
  try {
    await player.play();
    S.blocked = false;
    $("soundBtn").hidden = true;
  } catch {
    // The browser blocked sound (usually after the screen turned off). Ask for a tap.
    S.playing = false;
    S.blocked = true;
    $("soundBtn").textContent = "🔊 " + t().tapSound;
    $("soundBtn").hidden = false;
  }
  setStatus();
}

function playPhoneVoice(seq, line) {
  if (!("speechSynthesis" in window)) { addCaption(seq, line.text); return done(); }
  S.playing = true;
  addCaption(seq, line.text);
  const L = getLanguage(lang);
  const u = new SpeechSynthesisUtterance(line.text);
  const voices = speechSynthesis.getVoices() || [];
  const v = voices.find((x) => x.lang && x.lang.toLowerCase().replace("_", "-").startsWith(L.speechTag.toLowerCase()))
    || voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(L.code));
  if (v) u.voice = v;
  u.lang = v ? v.lang : L.speechTag;
  u.onend = done;
  u.onerror = done;
  speechSynthesis.speak(u);
  setStatus();
}

function done() {
  S.playing = false;
  S.next++;
  S.after = Math.max(S.after, S.next - 1);
  setStatus();
  tick();
  if (S.ended && S.next > S.count) schedulePoll();
}

function stopAudio() {
  try { player.pause(); } catch {}
  try { speechSynthesis.cancel(); } catch {}
  S.playing = false;
}

$("soundBtn").addEventListener("click", () => {
  S.blocked = false;
  $("soundBtn").hidden = true;
  unlockAudio();
  tick();
});

/* ---------- captions & status ---------- */
function addCaption(seq, text) {
  const list = $("captions");
  if (list.querySelector(`[data-seq="${seq}"]`)) return;
  list.querySelectorAll("li.current").forEach((li) => li.classList.remove("current"));
  const li = document.createElement("li");
  li.dataset.seq = seq;
  li.className = "current";
  li.lang = lang;
  li.dir = getLanguage(lang).dir;
  li.textContent = text;
  list.appendChild(li);
  li.scrollIntoView({ behavior: "smooth", block: "end" });
}

function setStatus() {
  const ui = t();
  let text = ui.waiting, state = "wait";
  if (S.ended && S.next > S.count && !S.playing) { text = ui.ended; state = "ended"; }
  else if (S.playing || S.count > S.after0) { text = ui.listening; state = "live"; }
  $("statusText").textContent = text;
  $("statusText").lang = lang;
  $("statusText").dir = getLanguage(lang).dir;
  $("statusDot").className = `dot ${state}`;
  if (state === "ended") releaseAwake();
}

/* ---------- keep the screen on ---------- */
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
}
function releaseAwake() {
  try { wakeLock && wakeLock.release(); } catch {}
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.active) {
    keepAwake();
    schedulePoll();
    tick();
  }
});
