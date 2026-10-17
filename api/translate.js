import { getConfig, checkPasscode, readJson, sendJson } from "../lib/config.js";
import { translateWithClaude, MAX_INPUT_CHARS } from "../lib/translate.js";
import { LANGUAGES, DEFAULT_LANGUAGE } from "../public/languages.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });

  const config = getConfig(req);
  if (!checkPasscode(req, config)) return sendJson(res, 401, { error: "Wrong passcode." });
  if (!config.anthropicKey) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY is not set in Vercel." });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Bad request." });
  }

  const english = String(body.english || "").trim();
  if (!english) return sendJson(res, 400, { error: "Nothing to translate yet." });
  if (english.length > MAX_INPUT_CHARS) {
    return sendJson(res, 400, { error: `That's too long (${english.length} characters). Keep it under ${MAX_INPUT_CHARS}.` });
  }

  const language = String(body.language || DEFAULT_LANGUAGE);
  if (!LANGUAGES[language]) return sendJson(res, 400, { error: "That language isn't supported yet." });

  try {
    const result = await translateWithClaude({
      english,
      language,
      apiKey: config.anthropicKey,
      model: config.anthropicModel,
    });
    return sendJson(res, 200, { ...result, language });
  } catch (err) {
    console.error("translate error:", err);
    return sendJson(res, err.status && err.status < 500 ? 502 : 500, { error: err.message || "Translation failed." });
  }
}
