// Preshift Translator — runs in the phone's browser.
// 1) Speech-to-text with the browser's built-in recognizer (free)
// 2) /api/translate  → Claude translates the meaning into Spanish
// 3) /api/speak      → ElevenLabs speaks each paragraph in your cloned voice
// Audio is cached on the phone, so replays don't use credits.

const $ = (id) => document.getElementById(id);
const els = {
  gate: $("gate"), gateForm: $("gateForm"), gateInput: $("gateInput"), gateError: $("gateError"),
  app: $("app"),
  recordBtn: $("recordBtn"), recordLabel: $("recordLabel"), timer: $("timer"),
  speechWarning: $("speechWarning"),
  english: $("english"), charCount: $("charCount"), clearBtn: $("clearBtn"),
  translateBtn: $("translateBtn"), translateStatus: $("translateStatus"),
  stepPlay: $("stepPlay"), unclear: $("unclear"),
  playBtn: $("playBtn"), playLabel: $("playLabel"), restartBtn: $("restartBtn"),
  audioStatus: $("audioStatus"), progressBar: $("progressBar"),
  paragraphs: $("paragraphs"),
  player: $("player"),
  settingsBtn: $("settingsBtn"), settings: $("settings"), speed: $("speed"),
  setupStatus: $("setupStatus"), forgetBtn: $("forgetBtn"), lockBtn: $("lockBtn"),
};

/* ---------- small storage helpers (never throw) ---------- */
const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ---------- API ---------- */
function passcode() { return store.get("passcode", ""); }

async function api(path, body, { asBlob = false } = {}) {
  const resp = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-app-passcode": passcode() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (resp.status === 401) { lock(); throw new Error("Passcode needed."); }
  if (!resp.ok) {
    let msg = `Something went wrong (${resp.status}).`;
    try { msg = (await resp.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return asBlob ? resp.blob() : resp.json();
}

/* ---------- passcode gate ---------- */
let setup = null;

async function unlock() {
  const tried = passcode();
  try {
    setup = await api("/api/check");
    els.gate.hidden = true;
    els.app.hidden = false;
    renderSetup();
    restoreLast();
  } catch (e) {
    if (tried) {
      els.gateError.textContent = e.message === "Passcode needed." ? "That passcode didn't work." : e.message;
      els.gateError.hidden = false;
    }
    showGate();
  }
}
function showGate() { els.app.hidden = true; els.gate.hidden = false; els.gateInput.focus(); }
function lock() { store.del("passcode"); stopRecording(); showGate(); }

els.gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  store.set("passcode", els.gateInput.value.trim());
  els.gateInput.value = "";
  els.gateError.hidden = true;
  unlock();
});

function renderSetup() {
  if (!setup) return;
  const line = (ok, okText, badText) => `<p class="${ok ? "ok" : "error"}">${ok ? "✓ " + okText : "✕ " + badText}</p>`;
  els.setupStatus.innerHTML =
    line(setup.translation, "Translation connected", "Translation key missing (ANTHROPIC_API_KEY)") +
    line(setup.voice, "Your voice connected", "Voice not set up (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID)") +
    (setup.passcodeSet ? "" : `<p class="error">✕ No passcode set (APP_PASSCODE) — anyone with the link can use your credits</p>`);
}

/* ---------- speech recognition ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let recording = false;
let baseText = "";       // text before this recognition session
let sessionSegs = [];    // finalized segments in this session
let wakeLock = null;
let timerStart = 0, timerHandle = null;

if (!SR) {
  els.speechWarning.textContent =
    "This browser can't do voice typing. Use Chrome (Android) or Safari (iPhone), or tap the microphone on your keyboard and talk.";
  els.speechWarning.hidden = false;
  els.recordBtn.disabled = true;
}

function joinText(a, b) {
  a = a.trim(); b = b.trim();
  if (!a) return b;
  if (!b) return a;
  return a + (/[.!?]$/.test(a) ? " " : ". ") + b;
}

// Some Android versions repeat earlier words in later results.
// If a new final result starts with the previous one, replace instead of append.
function addSegment(segs, t) {
  t = t.trim();
  if (!t) return;
  const last = segs[segs.length - 1];
  if (last && t.toLowerCase().startsWith(last.toLowerCase())) segs[segs.length - 1] = t;
  else if (!last || !last.toLowerCase().endsWith(t.toLowerCase())) segs.push(t);
}

function startSession() {
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  baseText = els.english.value;
  sessionSegs = [];

  recognition.onresult = (event) => {
    const segs = [];
    let interim = "";
    for (let i = 0; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) addSegment(segs, r[0].transcript);
      else interim += r[0].transcript;
    }
    sessionSegs = segs;
    const finalText = segs.map(capitalize).join(". ");
    els.english.value = joinText(baseText, joinText(finalText, interim));
    els.english.scrollTop = els.english.scrollHeight;
    updateCount();
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      els.speechWarning.textContent = "Microphone is blocked. Allow microphone access for this site in your browser settings, then try again.";
      els.speechWarning.hidden = false;
      stopRecording();
    } else if (event.error === "network") {
      els.speechWarning.textContent = "Voice typing needs an internet connection.";
      els.speechWarning.hidden = false;
    }
    // "no-speech" / "aborted" just restart via onend
  };

  recognition.onend = () => {
    // Lock in what we heard, then keep listening until you tap stop.
    const finalText = sessionSegs.map(capitalize).join(". ");
    els.english.value = joinText(baseText, finalText);
    updateCount();
    if (recording) setTimeout(() => { if (recording) safeStart(); }, 150);
  };

  try { recognition.start(); } catch {}
}

function safeStart() { try { startSession(); } catch { setTimeout(() => recording && safeStart(), 500); } }

function capitalize(s) { s = s.trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; }

async function startRecording() {
  if (!SR) return;
  stopPlayback();
  recording = true;
  els.speechWarning.hidden = true;
  els.recordBtn.classList.add("on");
  els.recordBtn.setAttribute("aria-pressed", "true");
  els.recordLabel.textContent = "Listening… tap to stop";
  els.english.readOnly = true;
  timerStart = Date.now();
  els.timer.hidden = false;
  tick();
  timerHandle = setInterval(tick, 1000);
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  safeStart();
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  try { recognition && recognition.stop(); } catch {}
  els.recordBtn.classList.remove("on");
  els.recordBtn.setAttribute("aria-pressed", "false");
  els.recordLabel.textContent = els.english.value.trim() ? "Tap to add more" : "Tap to start";
  els.english.readOnly = false;
  clearInterval(timerHandle);
  try { wakeLock && wakeLock.release(); } catch {}
  wakeLock = null;
}

function tick() {
  const s = Math.floor((Date.now() - timerStart) / 1000);
  els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

els.recordBtn.addEventListener("click", () => (recording ? stopRecording() : startRecording()));

function updateCount() {
  const n = els.english.value.trim().length;
  els.charCount.textContent = `${n.toLocaleString()} characters`;
  els.translateBtn.disabled = n === 0;
}
els.english.addEventListener("input", updateCount);
els.clearBtn.addEventListener("click", () => {
  if (els.english.value.trim() && !confirm("Clear what you said?")) return;
  stopRecording();
  els.english.value = "";
  els.recordLabel.textContent = "Tap to start";
  els.timer.hidden = true;
  updateCount();
});

/* ---------- translation ---------- */
let current = null; // { english, paragraphs:[{spanish, back_translation}], unclear_parts, speed }

els.translateBtn.addEventListener("click", async () => {
  stopRecording();
  unlockAudio();
  const english = els.english.value.trim();
  if (!english) return;
  if (current && current.english === english && !confirm("Translate the same text again? This uses a little more credit.")) return;

  setTranslateStatus("Translating… (about 10–20 seconds)");
  els.translateBtn.disabled = true;
  try {
    const result = await api("/api/translate", { english });
    current = { english, paragraphs: result.paragraphs, unclear_parts: result.unclear_parts || [], speed: speed() };
    saveLast();
    setTranslateStatus("");
    renderTranslation();
    els.stepPlay.scrollIntoView({ behavior: "smooth", block: "start" });
    prepareAudio();
  } catch (e) {
    setTranslateStatus(e.message, true);
  } finally {
    els.translateBtn.disabled = !els.english.value.trim();
  }
});

function setTranslateStatus(msg, isError = false) {
  els.translateStatus.textContent = msg;
  els.translateStatus.hidden = !msg;
  els.translateStatus.classList.toggle("error", isError);
}

function renderTranslation() {
  els.stepPlay.hidden = false;
  if (current.unclear_parts.length) {
    els.unclear.innerHTML = "<strong>Double-check these parts</strong> — they may have been misheard:<br>" +
      current.unclear_parts.map((u) => "• " + escapeHtml(u)).join("<br>");
    els.unclear.hidden = false;
  } else {
    els.unclear.hidden = true;
  }
  els.paragraphs.innerHTML = "";
  current.paragraphs.forEach((p, i) => {
    const li = document.createElement("li");
    li.dataset.index = i;
    li.innerHTML = `
      <p class="es" lang="es">${escapeHtml(p.spanish)}</p>
      <div class="state" id="state-${i}">Waiting…</div>
      <details><summary>What this says in English</summary><p class="en">${escapeHtml(p.back_translation)}</p></details>`;
    li.addEventListener("click", (ev) => {
      if (ev.target.closest("details")) return;
      unlockAudio();
      playFrom(i);
    });
    els.paragraphs.appendChild(li);
  });
  updatePlayUi();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- audio cache (IndexedDB, best effort) ---------- */
const memCache = new Map(); // key -> objectURL
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open("preshift-audio", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("clips");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}
async function idbGet(key) {
  const d = await db(); if (!d) return null;
  return new Promise((res) => {
    try { const r = d.transaction("clips").objectStore("clips").get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }
    catch { res(null); }
  });
}
async function idbPut(key, blob) {
  const d = await db(); if (!d) return;
  try { d.transaction("clips", "readwrite").objectStore("clips").put(blob, key); } catch {}
}
async function idbClear() {
  const d = await db(); if (!d) return;
  try { d.transaction("clips", "readwrite").objectStore("clips").clear(); } catch {}
}

async function clipKey(text, spd) {
  const data = new TextEncoder().encode(`${spd}|${text}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- audio generation ---------- */
let clips = [];          // per paragraph: { status: 'waiting'|'loading'|'ready'|'error', url, error }
let prepareRun = 0;

// cacheOnly: use audio already saved on this phone, but don't spend credits.
async function prepareAudio({ cacheOnly = false } = {}) {
  const run = ++prepareRun;
  const paras = current.paragraphs;
  const spd = current.speed;
  clips = paras.map(() => ({ status: "waiting" }));
  updatePlayUi();

  for (let i = 0; i < paras.length; i++) {
    if (run !== prepareRun) return;
    await loadClip(i, paras, spd, run, cacheOnly);
  }
}

async function loadClip(i, paras, spd, run, cacheOnly = false) {
  const text = paras[i].spanish;
  const key = await clipKey(text, spd);
  clips[i] = { status: "loading" };
  setClipState(i);
  try {
    let url = memCache.get(key);
    if (!url) {
      let blob = await idbGet(key);
      if (!blob && cacheOnly) {
        clips[i] = { status: "missing" };
        setClipState(i);
        updatePlayUi();
        return;
      }
      if (!blob) {
        blob = await api("/api/speak", {
          text,
          speed: spd,
          previous_text: paras[i - 1]?.spanish || "",
          next_text: paras[i + 1]?.spanish || "",
        }, { asBlob: true });
        idbPut(key, blob);
      }
      url = URL.createObjectURL(blob);
      memCache.set(key, url);
    }
    if (run !== prepareRun) return;
    clips[i] = { status: "ready", url };
  } catch (e) {
    if (run !== prepareRun) return;
    clips[i] = { status: "error", error: e.message };
  }
  setClipState(i);
  updatePlayUi();
  if (waitingFor === i) playIndex(i);
}

function setClipState(i) {
  const el = document.getElementById(`state-${i}`);
  if (!el) return;
  const c = clips[i] || {};
  el.classList.toggle("err", c.status === "error");
  el.textContent = {
    waiting: "Waiting…",
    missing: "No audio saved yet",
    loading: "Making audio…",
    ready: "Ready ✓",
    error: `Audio failed: ${c.error || "error"} — tap to retry`,
  }[c.status] || "";
}

/* ---------- playback ---------- */
let playing = false;
let playingIndex = -1;
let waitingFor = -1;
let audioUnlocked = false;

// iPhones only allow sound that starts from a tap. Playing a silent clip
// during a tap "unlocks" the player for the rest of the session.
const SILENT_WAV = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    els.player.src = SILENT_WAV;
    const p = els.player.play();
    if (p) p.catch(() => { audioUnlocked = false; });
  } catch { audioUnlocked = false; }
}

function playFrom(i) {
  if (!current) return;
  const c = clips[i];
  if (c && c.status === "error") {
    // retry this paragraph, then continue
    loadClip(i, current.paragraphs, current.speed, prepareRun);
  }
  playing = true;
  playIndex(i);
}

function playIndex(i) {
  if (!playing) return;
  if (i >= clips.length) { finishPlayback(); return; }
  const c = clips[i];
  markCurrent(i);
  if (!c || c.status !== "ready") {
    waitingFor = i;
    els.playLabel.textContent = "Getting next part ready…";
    if (c && c.status === "error") { waitingFor = -1; playIndex(i + 1); }
    return;
  }
  waitingFor = -1;
  playingIndex = i;
  els.player.src = c.url;
  const p = els.player.play();
  if (p) p.catch(() => { playing = false; updatePlayUi(); });
  updatePlayUi();
}

els.player.addEventListener("ended", () => {
  if (!playing || playingIndex < 0) return;
  playIndex(playingIndex + 1);
});
els.player.addEventListener("timeupdate", updateProgress);

function finishPlayback() {
  playing = false;
  playingIndex = -1;
  waitingFor = -1;
  markCurrent(-1);
  els.progressBar.style.width = "100%";
  updatePlayUi();
}

function stopPlayback() {
  playing = false;
  waitingFor = -1;
  try { els.player.pause(); } catch {}
  updatePlayUi();
}

els.playBtn.addEventListener("click", () => {
  unlockAudio();
  if (playing) {
    playing = false;
    waitingFor = -1;
    els.player.pause();
    updatePlayUi();
    return;
  }
  // A restored preshift with no saved audio: make it now, then play.
  if (clips.some((c) => c.status === "missing")) {
    prepareAudio();
    playFrom(0);
    return;
  }
  // resume if paused mid-paragraph, otherwise start from the top
  if (playingIndex >= 0 && els.player.currentTime > 0 && !els.player.ended) {
    playing = true;
    els.player.play().catch(() => { playing = false; updatePlayUi(); });
    updatePlayUi();
  } else {
    playFrom(0);
  }
});

els.restartBtn.addEventListener("click", () => {
  unlockAudio();
  try { els.player.pause(); } catch {}
  playingIndex = -1;
  playFrom(0);
});

function markCurrent(i) {
  els.paragraphs.querySelectorAll("li").forEach((li) => li.classList.toggle("current", Number(li.dataset.index) === i));
  const li = els.paragraphs.querySelector(`li[data-index="${i}"]`);
  if (li && playing) li.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateProgress() {
  if (!clips.length || playingIndex < 0) return;
  const frac = els.player.duration ? els.player.currentTime / els.player.duration : 0;
  els.progressBar.style.width = `${((playingIndex + frac) / clips.length) * 100}%`;
}

function updatePlayUi() {
  const ready = clips.filter((c) => c.status === "ready").length;
  const failed = clips.filter((c) => c.status === "error").length;
  const total = clips.length;
  const missing = clips.some((c) => c.status === "missing");
  const firstReady = clips[0] && clips[0].status === "ready";

  els.playBtn.disabled = !firstReady && !playing && !missing;
  els.restartBtn.disabled = !firstReady;
  els.playBtn.classList.toggle("playing", playing);

  if (playing) els.playLabel.textContent = waitingFor >= 0 ? "Getting next part ready…" : "Pause";
  else if (missing) els.playLabel.textContent = "Make audio & play";
  else if (!total) els.playLabel.textContent = "Preparing voice…";
  else if (!firstReady) els.playLabel.textContent = clips[0].status === "error" ? "Audio failed — tap a paragraph to retry" : "Preparing voice…";
  else els.playLabel.textContent = playingIndex >= 0 ? "Resume" : "Play in Spanish";

  if (!total) els.audioStatus.textContent = "";
  else if (ready === total) els.audioStatus.textContent = "All audio ready";
  else els.audioStatus.textContent = `Audio ${ready} of ${total} ready${failed ? `, ${failed} failed` : ""}`;
}

/* ---------- save & restore the last preshift ---------- */
function saveLast() {
  store.set("last", JSON.stringify(current));
}
function restoreLast() {
  let last = null;
  try { last = JSON.parse(store.get("last", "null")); } catch {}
  if (!last || !Array.isArray(last.paragraphs) || !last.paragraphs.length) return;
  current = last;
  if (!els.english.value.trim()) els.english.value = last.english || "";
  updateCount();
  renderTranslation();
  prepareAudio({ cacheOnly: true }); // never spends credits just from opening the app
}

/* ---------- settings ---------- */
function speed() { return Number(store.get("speed", "0.95")) || 0.95; }
els.speed.value = String(speed());
els.speed.addEventListener("change", () => store.set("speed", els.speed.value));
els.settingsBtn.addEventListener("click", () => { renderSetup(); els.settings.showModal(); });
els.forgetBtn.addEventListener("click", async () => {
  if (!confirm("Clear the saved preshift and its audio from this phone?")) return;
  stopPlayback();
  store.del("last");
  await idbClear();
  memCache.clear();
  current = null; clips = [];
  els.stepPlay.hidden = true;
  els.paragraphs.innerHTML = "";
  els.settings.close();
});
els.lockBtn.addEventListener("click", () => { els.settings.close(); lock(); });

/* ---------- start ---------- */
updateCount();
unlock();
