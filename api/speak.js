import { getConfig, checkPasscode, readJson, sendJson } from "../lib/config.js";
import { synthesize } from "../lib/tts.js";

// Turns ONE paragraph into audio in your cloned voice.
// The app sends paragraphs one at a time so playback can start sooner
// and each response stays well under Vercel's size limit.

const MAX_CHUNK_CHARS = 3000;

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });

  const config = getConfig(req);
  if (!checkPasscode(req, config)) return sendJson(res, 401, { error: "Wrong passcode." });
  if (!config.elevenKey) return sendJson(res, 500, { error: "Add your ElevenLabs API key in Settings (⚙)." });
  if (!config.elevenVoiceId) return sendJson(res, 500, { error: "Add your ElevenLabs Voice ID in Settings (⚙)." });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Bad request." });
  }

  const text = String(body.text || "").trim();
  if (!text) return sendJson(res, 400, { error: "No text to speak." });
  if (text.length > MAX_CHUNK_CHARS) return sendJson(res, 400, { error: "Paragraph too long to speak at once." });

  try {
    const audio = await synthesize({
      text,
      apiKey: config.elevenKey,
      voiceId: config.elevenVoiceId,
      model: config.elevenModel,
      speed: body.speed,
      previousText: body.previous_text,
      nextText: body.next_text,
    });
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", audio.length);
    res.end(audio);
  } catch (err) {
    return sendJson(res, 502, { error: err.message || "Voice generation failed." });
  }
}
