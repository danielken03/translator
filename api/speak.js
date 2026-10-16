import { getConfig, checkPasscode, readJson, sendJson } from "../lib/config.js";

// Turns ONE paragraph of Spanish into audio in your cloned voice.
// The app sends paragraphs one at a time so playback can start sooner
// and each response stays well under Vercel's size limit.

const MAX_CHUNK_CHARS = 3000;

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });

  const config = getConfig(req);
  if (!checkPasscode(req, config)) return sendJson(res, 401, { error: "Wrong passcode." });
  if (!config.elevenKey) return sendJson(res, 500, { error: "ELEVENLABS_API_KEY is not set in Vercel." });
  if (!config.elevenVoiceId) return sendJson(res, 500, { error: "ELEVENLABS_VOICE_ID is not set in Vercel." });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Bad request." });
  }

  const text = String(body.text || "").trim();
  if (!text) return sendJson(res, 400, { error: "No text to speak." });
  if (text.length > MAX_CHUNK_CHARS) return sendJson(res, 400, { error: "Paragraph too long to speak at once." });

  const speed = clamp(Number(body.speed) || 1, 0.7, 1.2);

  const payload = {
    text,
    model_id: config.elevenModel,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
      style: 0,
      use_speaker_boost: true,
      speed,
    },
  };
  // Helps paragraphs flow together naturally when played back to back.
  if (body.previous_text) payload.previous_text = String(body.previous_text).slice(-1000);
  if (body.next_text) payload.next_text = String(body.next_text).slice(0, 1000);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenVoiceId)}?output_format=mp3_44100_128`;

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": config.elevenKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("elevenlabs network error:", err);
    return sendJson(res, 502, { error: "Couldn't reach ElevenLabs. Try again." });
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error("elevenlabs error:", resp.status, detail);
    return sendJson(res, 502, { error: friendlyElevenError(resp.status, detail) });
  }

  const audio = Buffer.from(await resp.arrayBuffer());
  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", audio.length);
  res.end(audio);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function friendlyElevenError(status, detail) {
  if (status === 401) return "ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY in Vercel.";
  if (/quota_exceeded|credits/i.test(detail)) return "ElevenLabs is out of credits for this month. Upgrade your plan or wait for the reset.";
  if (status === 404 || /voice_not_found/i.test(detail)) return "ElevenLabs couldn't find your voice. Check ELEVENLABS_VOICE_ID in Vercel.";
  if (status === 429) return "ElevenLabs is busy. Wait a moment and try again.";
  return `Voice generation failed (ElevenLabs error ${status}).`;
}
