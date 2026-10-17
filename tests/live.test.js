import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { _setRedisExecutor } from "../lib/redis.js";
import { createMemoryRedis } from "../lib/memredis.js";

_setRedisExecutor(createMemoryRedis());
process.env.APP_PASSCODE = "pc";
process.env.ANTHROPIC_API_KEY = "a";
process.env.ELEVENLABS_API_KEY = "e";
process.env.ELEVENLABS_VOICE_ID = "VoiceAbc12345";

let anthropicCalls = [];
let elevenCalls = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("anthropic")) {
    const body = JSON.parse(opts.body);
    anthropicCalls.push(body);
    const lang = /into (\w+)/.exec(body.system)[1];
    const piece = /<new>\n([\s\S]*?)\n<\/new>/.exec(body.messages[0].content)[1];
    const text = piece === "um" ? "" : `[${lang}] ${piece}`;
    return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "deliver_line", input: { text } }] }), { status: 200 });
  }
  if (String(url).includes("elevenlabs")) {
    elevenCalls.push(JSON.parse(opts.body));
    return new Response(Buffer.from("FAKEMP3"), { status: 200 });
  }
  throw new Error("unexpected fetch " + url);
};

const { default: room } = await import("../api/room.js");

function call({ method = "GET", query, headers = {}, body }) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = "/api/room?" + new URLSearchParams(query).toString();
  req.headers = headers;
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.end = (b) => (res.body = b);
  return room(req, res).then(() => ({
    status: res.statusCode,
    json: () => JSON.parse(res.body),
    raw: res.body,
    type: res.headers["content-type"],
  }));
}

test("full live room flow", async () => {
  // speaker needs the passcode
  assert.equal((await call({ method: "POST", query: { action: "create" } })).status, 401);
  const created = await call({ method: "POST", query: { action: "create" }, headers: { "x-app-passcode": "pc" } });
  assert.equal(created.status, 200);
  const { code, hostToken } = created.json();
  assert.match(code, /^[A-Z0-9]{4}$/);
  const host = { "x-app-passcode": "pc", "x-room-token": hostToken };

  // unknown room
  assert.equal((await call({ query: { action: "poll", code: "ZZZZ", lang: "es", after: -1, id: "x" } })).status, 404);

  // two listeners join in different languages
  const j1 = (await call({ query: { action: "poll", code, lang: "es", after: -1, id: "L1" } })).json();
  const j2 = (await call({ query: { action: "poll", code, lang: "ar", after: -1, id: "L2" } })).json();
  assert.equal(j1.from, 0);
  assert.equal(j2.lines.length, 0);

  // speaker sees them
  const st = (await call({ query: { action: "status", code }, headers: host })).json();
  assert.equal(st.listeners, 2);
  assert.deepEqual(st.byLanguage, { es: 1, ar: 1 });

  // wrong host token is rejected
  assert.equal((await call({ method: "POST", query: { action: "push", code }, headers: { "x-app-passcode": "pc", "x-room-token": "nope" }, body: { seq: 1, english: "hi" } })).status, 403);

  // speaker sends three lines (one is just filler)
  anthropicCalls = []; elevenCalls = [];
  const said = ["Good morning team", "um", "Rooms 912 and 915 are VIP"];
  for (let i = 0; i < said.length; i++) {
    const r = await call({ method: "POST", query: { action: "push", code }, headers: host, body: { seq: i + 1, english: said[i], speed: 0.95 } });
    assert.equal(r.status, 200);
  }
  assert.equal(anthropicCalls.length, 6, "translated once per language per line");
  assert.equal(elevenCalls.length, 4, "voiced once per language, skipping filler");
  assert.equal(elevenCalls[0].model_id, "eleven_flash_v2_5");
  // context of earlier lines is passed along
  assert.match(anthropicCalls[4].messages[0].content, /<earlier>[\s\S]*Good morning team/);

  // Spanish listener gets their lines
  const p = (await call({ query: { action: "poll", code, lang: "es", after: 0, id: "L1" } })).json();
  assert.deepEqual(p.lines.map((l) => l.seq), [1, 2, 3]);
  assert.equal(p.lines[0].text, "[Spanish] Good morning team");
  assert.equal(p.lines[0].audio, "ready");
  assert.equal(p.lines[1].skip, true);

  // audio comes back as mp3
  const a = await call({ query: { action: "audio", code, lang: "es", seq: 3 } });
  assert.equal(a.status, 200);
  assert.equal(a.type, "audio/mpeg");
  assert.equal(Buffer.from(a.raw).toString(), "FAKEMP3");

  // a fifth language is refused once 4 are in use
  for (const l of ["fr", "zh"]) await call({ query: { action: "poll", code, lang: l, after: -1, id: "X" + l } });
  assert.equal((await call({ query: { action: "poll", code, lang: "ko", after: -1, id: "K" } })).status, 409);

  // end the room
  assert.equal((await call({ method: "POST", query: { action: "end", code }, headers: host })).status, 200);
  const after = (await call({ query: { action: "poll", code, lang: "es", after: 3, id: "L1" } })).json();
  assert.equal(after.ended, true);
  assert.equal((await call({ method: "POST", query: { action: "push", code }, headers: host, body: { seq: 4, english: "more" } })).status, 409);
});

test("without ElevenLabs, listeners get text for the phone voice", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const { code, hostToken } = (await call({ method: "POST", query: { action: "create" }, headers: { "x-app-passcode": "pc" } })).json();
  await call({ query: { action: "poll", code, lang: "es", after: -1, id: "L1" } });
  await call({ method: "POST", query: { action: "push", code }, headers: { "x-app-passcode": "pc", "x-room-token": hostToken }, body: { seq: 1, english: "Hello" } });
  const p = (await call({ query: { action: "poll", code, lang: "es", after: 0, id: "L1" } })).json();
  assert.equal(p.lines[0].audio, "none");
  process.env.ELEVENLABS_API_KEY = "e";
});

test("lines stay in order even if they arrive out of order", async () => {
  const { code, hostToken } = (await call({ method: "POST", query: { action: "create" }, headers: { "x-app-passcode": "pc" } })).json();
  const host = { "x-app-passcode": "pc", "x-room-token": hostToken };
  await call({ query: { action: "poll", code, lang: "es", after: -1, id: "L" } });
  await call({ method: "POST", query: { action: "push", code }, headers: host, body: { seq: 2, english: "second" } });
  await call({ method: "POST", query: { action: "push", code }, headers: host, body: { seq: 1, english: "first" } });
  const p = (await call({ query: { action: "poll", code, lang: "es", after: 0, id: "L" } })).json();
  assert.equal(p.count, 2);
  assert.deepEqual(p.lines.map((l) => l.text), ["[Spanish] first", "[Spanish] second"]);
  assert.equal((await call({ method: "POST", query: { action: "push", code }, headers: host, body: { english: "no number" } })).status, 400);
});
