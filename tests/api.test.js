import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { translateWithClaude, buildSystemPrompt } from "../lib/translate.js";

function mockReq({ method = "POST", headers = {}, body } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.headers = headers;
  return req;
}
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.end = (b) => (res.body = b);
  res.json = () => JSON.parse(res.body);
  return res;
}

test("system prompt asks for neutral Latin American Spanish and includes glossary", () => {
  const p = buildSystemPrompt("es");
  assert.match(p, /ustedes/);
  assert.match(p, /Latin American/);
  assert.match(p, /stayover/);
});

test("translateWithClaude parses the tool result", async () => {
  let sent;
  const fakeFetch = async (url, opts) => {
    sent = { url, opts };
    return new Response(JSON.stringify({
      content: [{ type: "tool_use", name: "deliver_translation", input: {
        paragraphs: [{ text: " Hola equipo. ", back_translation: "Hi team." }, { text: "", back_translation: "" }],
        unclear_parts: ["room 41?"],
      } }],
      usage: { input_tokens: 10, output_tokens: 20 },
    }), { status: 200 });
  };
  const out = await translateWithClaude({ english: "Hi team", apiKey: "k", model: "m", fetchImpl: fakeFetch });
  assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
  const body = JSON.parse(sent.opts.body);
  assert.equal(body.tool_choice.type, "auto");
  assert.equal(body.tools[0].name, "deliver_translation");
  assert.equal(sent.opts.headers["x-api-key"], "k");
  assert.deepEqual(out.paragraphs, [{ text: "Hola equipo.", back_translation: "Hi team." }]);
  assert.deepEqual(out.unclear_parts, ["room 41?"]);
});

test("translateWithClaude gives a friendly out-of-credits message", async () => {
  const fakeFetch = async () => new Response('{"error":{"message":"Your credit balance is too low"}}', { status: 400 });
  await assert.rejects(
    translateWithClaude({ english: "x", apiKey: "k", model: "m", fetchImpl: fakeFetch }),
    /out of credits/,
  );
});

test("API routes reject a wrong passcode", async () => {
  process.env.APP_PASSCODE = "secret";
  process.env.ANTHROPIC_API_KEY = "k";
  const { default: translate } = await import("../api/translate.js");
  const res = mockRes();
  await translate(mockReq({ headers: { "x-app-passcode": "nope" }, body: { english: "hi" } }), res);
  assert.equal(res.statusCode, 401);
});

test("translate route rejects empty text", async () => {
  process.env.APP_PASSCODE = "secret";
  const { default: translate } = await import("../api/translate.js");
  const res = mockRes();
  await translate(mockReq({ headers: { "x-app-passcode": "secret" }, body: { english: "  " } }), res);
  assert.equal(res.statusCode, 400);
});

test("speak route reports missing voice setup", async () => {
  process.env.APP_PASSCODE = "secret";
  process.env.ELEVENLABS_API_KEY = "e";
  delete process.env.ELEVENLABS_VOICE_ID;
  const { default: speak } = await import("../api/speak.js");
  const res = mockRes();
  await speak(mockReq({ headers: { "x-app-passcode": "secret" }, body: { text: "hola" } }), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.json().error, /Voice ID/);
});

test("check route reports what's configured", async () => {
  process.env.APP_PASSCODE = "secret";
  const { default: check } = await import("../api/check.js");
  const res = mockRes();
  await check(mockReq({ method: "GET", headers: { "x-app-passcode": "secret" } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().translation, true);
  assert.equal(res.json().voice, false);
});

test("phone-provided ElevenLabs key and voice override Vercel settings", async () => {
  process.env.ELEVENLABS_API_KEY = "server-key";
  process.env.ELEVENLABS_VOICE_ID = "serverVoice123";
  const { getConfig } = await import("../lib/config.js");
  const fromPhone = getConfig({ headers: { "x-eleven-key": "sk_phonekey123", "x-eleven-voice": "PhoneVoice12345" } });
  assert.equal(fromPhone.elevenKey, "sk_phonekey123");
  assert.equal(fromPhone.elevenVoiceId, "PhoneVoice12345");
  const fallback = getConfig({ headers: { "x-eleven-voice": "bad voice id!" } });
  assert.equal(fallback.elevenKey, "server-key");
  assert.equal(fallback.elevenVoiceId, "serverVoice123");
});

test("falls back to JSON in a text reply", async () => {
  const { extractResult } = await import("../lib/translate.js");
  const out = extractResult({ content: [{ type: "text", text: 'Here you go: {"paragraphs":[{"text":"Hola","back_translation":"Hi"}],"unclear_parts":[]}' }] });
  assert.equal(out.paragraphs[0].text, "Hola");
});
