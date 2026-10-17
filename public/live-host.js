// Speaker side of a live room: start a room, show the code/QR, listen to the
// speaker and send each sentence as soon as they pause.

import qrcode from "/vendor/qrcode.mjs";
import { getLanguage } from "/languages.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ---------- One phone / Live room switch ---------- */
function setMode(mode) {
  const live = mode === "live";
  $("modeOne").classList.toggle("on", !live);
  $("modeLive").classList.toggle("on", live);
  $("modeOne").setAttribute("aria-selected", String(!live));
  $("modeLive").setAttribute("aria-selected", String(live));
  $("onePhone").hidden = live;
  $("liveRoom").hidden = !live;
  store.set("speakMode", mode);
  const sub = document.querySelector(".top .sub");
  if (sub) sub.hidden = live; // listeners pick their own language in a live room
  if (live) {
    // stop one-phone recording/playback if it was running
    const rec = $("recordBtn");
    if (rec && rec.classList.contains("on")) rec.click();
    try { $("player").pause(); } catch {}
  } else if (talking) {
    stopTalking();
  }
}
$("modeOne").addEventListener("click", () => setMode("one"));
$("modeLive").addEventListener("click", () => setMode("live"));

/* ---------- API ---------- */
function headers(extra = {}) {
  const h = { "content-type": "application/json", "x-app-passcode": store.get("passcode", ""), ...extra };
  const voice = store.get("elevenVoice", ""), key = store.get("elevenKey", "");
  if (voice && key) { h["x-eleven-voice"] = voice; h["x-eleven-key"] = key; }
  if (room) h["x-room-token"] = room.hostToken;
  return h;
}
async function roomApi(action, { method = "GET", body } = {}) {
  const q = new URLSearchParams({ action });
  if (room) q.set("code", room.code);
  const resp = await fetch(`/api/room?${q}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await resp.json(); } catch {}
  if (!resp.ok) {
    const err = new Error(data.error || `Something went wrong (${resp.status}).`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

/* ---------- room lifecycle ---------- */
let room = null; // { code, hostToken, seq }
let statusTimer = null;

function saveRoom() { if (room) store.set("liveRoom", JSON.stringify(room)); else store.del("liveRoom"); }

$("startRoomBtn").addEventListener("click", async () => {
  const btn = $("startRoomBtn");
  btn.disabled = true;
  showStartError("");
  try {
    const r = await roomApi("create", { method: "POST" });
    room = { code: r.code, hostToken: r.hostToken, seq: 0 };
    saveRoom();
    showRoom();
  } catch (e) {
    showStartError(e.message);
  } finally {
    btn.disabled = false;
  }
});

function showStartError(msg) {
  $("liveStartError").textContent = msg;
  $("liveStartError").hidden = !msg;
}

function joinUrl() { return `${location.origin}/listen?room=${room.code}`; }

function showRoom() {
  $("liveStart").hidden = true;
  $("liveActive").hidden = false;
  $("liveTalk").hidden = false;
  $("roomCode").textContent = room.code;
  $("joinLink").textContent = `${location.host}/listen`;
  try {
    const qr = qrcode(0, "M");
    qr.addData(joinUrl());
    qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch { $("qr").hidden = true; }
  refreshStatus();
  clearInterval(statusTimer);
  statusTimer = setInterval(refreshStatus, 3000);
}

function closeRoomUi() {
  clearInterval(statusTimer);
  stopTalking();
  room = null;
  saveRoom();
  $("liveStart").hidden = false;
  $("liveActive").hidden = true;
  $("liveTalk").hidden = true;
  $("liveLines").innerHTML = "";
  $("listeners").textContent = "Waiting for people to join…";
}

async function refreshStatus() {
  if (!room) return;
  try {
    const s = await roomApi("status");
    if (s.ended) return closeRoomUi();
    if (!s.listeners) {
      $("listeners").textContent = "Waiting for people to join…";
    } else {
      const parts = Object.entries(s.byLanguage).map(([code, n]) => `${getLanguage(code).name} ${n}`);
      $("listeners").textContent = `🎧 ${s.listeners} listening — ${parts.join(", ")}`;
    }
  } catch (e) {
    if (e.status === 404) { showStartError("That room expired. Start a new one."); closeRoomUi(); }
  }
}

$("shareBtn").addEventListener("click", async () => {
  if (!room) return;
  const url = joinUrl();
  try {
    if (navigator.share) await navigator.share({ title: "Join the meeting", text: `Room code ${room.code}`, url });
    else { await navigator.clipboard.writeText(url); $("shareBtn").textContent = "Link copied ✓"; setTimeout(() => ($("shareBtn").textContent = "Share link"), 2000); }
  } catch {}
});

$("endRoomBtn").addEventListener("click", async () => {
  if (!room || !confirm("End the room for everyone?")) return;
  try { await roomApi("end", { method: "POST" }); } catch {}
  closeRoomUi();
});

// Pick the room back up if the page was refreshed.
try {
  const saved = JSON.parse(store.get("liveRoom", "null"));
  if (saved && saved.code && saved.hostToken) { room = saved; showRoom(); }
} catch {}

/* ---------- listening to the speaker ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, talking = false, pushedInSession = 0, lastFinal = "", wakeLock = null;

if (!SR) {
  $("liveWarning").textContent = "This browser can't do voice typing. Use Chrome (Android) or Safari (iPhone).";
  $("liveWarning").hidden = false;
  $("liveRecordBtn").disabled = true;
}

$("liveRecordBtn").addEventListener("click", () => (talking ? stopTalking() : startTalking()));

async function startTalking() {
  if (!SR || !room) return;
  talking = true;
  $("liveWarning").hidden = true;
  $("liveRecordBtn").classList.add("on");
  $("liveRecordBtn").setAttribute("aria-pressed", "true");
  $("liveRecordLabel").textContent = "Live — tap to pause";
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  startSession();
}

function stopTalking() {
  talking = false;
  try { rec && rec.stop(); } catch {}
  $("liveRecordBtn").classList.remove("on");
  $("liveRecordBtn").setAttribute("aria-pressed", "false");
  $("liveRecordLabel").textContent = "Tap to start talking";
  showInterim("");
  try { wakeLock && wakeLock.release(); } catch {}
  wakeLock = null;
}

function startSession() {
  rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  pushedInSession = 0;
  lastFinal = "";

  rec.onresult = (event) => {
    let interim = "";
    for (let i = 0; i < event.results.length; i++) {
      const r = event.results[i];
      const said = r[0].transcript.trim();
      if (r.isFinal) {
        if (i >= pushedInSession) {
          // Some Android phones repeat earlier words in each new result;
          // only send the new part.
          let text = said;
          if (lastFinal && text.toLowerCase().startsWith(lastFinal.toLowerCase())) text = text.slice(lastFinal.length).trim();
          if (text) sendLine(text);
          lastFinal = said;
          pushedInSession = i + 1;
        }
      } else {
        interim += said + " ";
      }
    }
    showInterim(interim.trim());
  };
  rec.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      $("liveWarning").textContent = "Microphone is blocked. Allow microphone access for this site in your browser settings.";
      $("liveWarning").hidden = false;
      stopTalking();
    }
  };
  rec.onend = () => { if (talking) setTimeout(() => talking && startSession(), 150); };
  try { rec.start(); } catch {}
}

/* ---------- sending lines ---------- */
let interimEl = null;
function showInterim(text) {
  const list = $("liveLines");
  if (!text) { if (interimEl) { interimEl.remove(); interimEl = null; } return; }
  if (!interimEl) { interimEl = document.createElement("li"); interimEl.className = "interim"; }
  interimEl.textContent = text + " …";
  list.appendChild(interimEl);
  list.scrollTop = list.scrollHeight;
}

function sendLine(english) {
  if (!room) return;
  room.seq += 1;
  saveRoom();
  const seq = room.seq;
  const li = document.createElement("li");
  li.className = "sending";
  li.innerHTML = `<span class="en"></span><span class="meta">Sending…</span>`;
  li.querySelector(".en").textContent = english;
  const list = $("liveLines");
  list.insertBefore(li, interimEl && interimEl.parentNode === list ? interimEl : null);
  list.scrollTop = list.scrollHeight;
  push(seq, english, li, 0);
}

async function push(seq, english, li, attempt) {
  const meta = li.querySelector(".meta");
  try {
    const out = await roomApi("push", { method: "POST", body: { seq, english, speed: Number(store.get("speed", "0.95")) || 0.95 } });
    const langs = Object.entries(out.languages || {});
    if (!langs.length) {
      li.className = "sent";
      meta.textContent = "Sent — nobody listening yet";
      return;
    }
    const bad = langs.filter(([, r]) => !r.ok);
    li.className = bad.length ? "failed" : "sent";
    meta.textContent = langs
      .map(([code, r]) => `${getLanguage(code).name} ${r.skipped ? "–" : r.ok ? "✓" : r.voiceFailed ? "(text only)" : "✕"}`)
      .join(" · ");
    const voiceErr = bad.find(([, r]) => r.error);
    if (voiceErr) meta.title = voiceErr[1].error;
    if (bad.some(([, r]) => r.voiceFailed) && voiceErr) {
      $("liveWarning").textContent = voiceErr[1].error;
      $("liveWarning").hidden = false;
    }
  } catch (e) {
    if (e.status === 409 || e.status === 404) { meta.textContent = e.message; li.className = "failed"; return; }
    if (attempt < 1) return setTimeout(() => push(seq, english, li, attempt + 1), 1000);
    li.className = "failed";
    meta.textContent = `Not sent: ${e.message} — tap to retry`;
    li.onclick = () => { li.onclick = null; li.className = "sending"; meta.textContent = "Sending…"; push(seq, english, li, 0); };
  }
}

/* ---------- start ---------- */
setMode(store.get("speakMode", "one"));
