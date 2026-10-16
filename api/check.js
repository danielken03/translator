import { getConfig, checkPasscode, sendJson } from "../lib/config.js";

// Lets the app confirm the passcode and see which keys are set up,
// without ever sending the keys themselves to the phone.
export default async function handler(req, res) {
  const config = getConfig(req);
  if (!checkPasscode(req, config)) return sendJson(res, 401, { error: "Wrong passcode." });
  return sendJson(res, 200, {
    ok: true,
    translation: Boolean(config.anthropicKey),
    voice: Boolean(config.elevenKey && config.elevenVoiceId),
    passcodeSet: Boolean(config.passcode),
  });
}
