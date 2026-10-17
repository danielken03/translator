// Where the app gets its keys and settings.
//
// ElevenLabs key + voice can come from two places:
//   1) The phone's Settings screen (sent with each request, saved only on that phone)
//   2) Vercel environment variables (the fallback)
// The phone's values win, so each person can use their own ElevenLabs account.
// When real user accounts are added later, look up the signed-in user's saved
// key and voice here instead.

const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;

export function getConfig(req) {
  const headers = (req && req.headers) || {};
  const phoneKey = cleanHeader(headers["x-eleven-key"], 200);
  const phoneVoice = cleanHeader(headers["x-eleven-voice"], 40);
  return {
    passcode: process.env.APP_PASSCODE || "",
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    elevenKey: phoneKey || process.env.ELEVENLABS_API_KEY || "",
    elevenVoiceId: (VOICE_ID_RE.test(phoneVoice) ? phoneVoice : "") || process.env.ELEVENLABS_VOICE_ID || "",
    elevenModel: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
    // Live rooms favor speed: a faster translator and ElevenLabs' low-latency
    // voice model (about half the credits of the multilingual model).
    anthropicLiveModel: process.env.ANTHROPIC_LIVE_MODEL || "claude-haiku-5-5",
    elevenLiveModel: process.env.ELEVENLABS_LIVE_MODEL || "eleven_flash_v2_5",
    serverVoice: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
  };
}

function cleanHeader(v, max) {
  const s = String(v || "").trim();
  return s.length > 0 && s.length <= max && /^[\x21-\x7e]+$/.test(s) ? s : "";
}

// Simple shared passcode so strangers can't use up your credits.
export function checkPasscode(req, config) {
  if (!config.passcode) return true; // no passcode set = open (not recommended)
  const sent = req.headers["x-app-passcode"] || "";
  return timingSafeEqual(String(sent), config.passcode);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}
