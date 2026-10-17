// Live rooms: the speaker's phone sends each sentence as they pause; the
// server translates it into every language someone is listening in, makes
// the audio once per language, and listeners' phones pick it up by polling.
//
// Everything lives in Redis and expires on its own a few hours later.

import crypto from "node:crypto";
import { pipe, cmd } from "./redis.js";
import { translateLine } from "./translate.js";
import { synthesize } from "./tts.js";
import { LANGUAGES } from "../public/languages.js";

export const ROOM_TTL = 4 * 60 * 60; // seconds
export const MAX_LANGUAGES = 4; // per room, to keep voice costs predictable
export const MAX_LINE_CHARS = 1200;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const LISTENER_WINDOW_MS = 20000;

const k = (code, part) => `room:${code}:${part}`;

export function normalizeCode(code) {
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{4,6}$/.test(c) ? c : "";
}

function randomCode(len = 4) {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export async function createRoom() {
  const hostToken = crypto.randomBytes(18).toString("base64url");
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(attempt < 5 ? 4 : 5);
    const meta = JSON.stringify({ hostToken, created: Date.now(), ended: false });
    const ok = await cmd("SET", k(code, "meta"), meta, "NX", "EX", ROOM_TTL);
    if (ok) return { code, hostToken };
  }
  throw new Error("Couldn't create a room. Try again.");
}

export async function getMeta(code) {
  const raw = await cmd("GET", k(code, "meta"));
  return raw ? JSON.parse(raw) : null;
}

export async function checkHost(code, token) {
  const meta = await getMeta(code);
  if (!meta) return { error: "That room has expired. Start a new one.", status: 404 };
  if (!token || token !== meta.hostToken) return { error: "Only the speaker can do that.", status: 403 };
  return { meta };
}

export async function endRoom(code) {
  const meta = await getMeta(code);
  if (!meta) return;
  meta.ended = true;
  await cmd("SET", k(code, "meta"), JSON.stringify(meta), "EX", ROOM_TTL);
}

// The newest line number in the room (0 if nothing said yet).
export async function latestSeq(code) {
  const top = await cmd("ZREVRANGE", k(code, "seqs"), "0", "0", "WITHSCORES");
  return top && top.length ? Number(top[1]) : 0;
}

// Speaker sent a new piece of speech. The speaker's phone numbers each line
// (seq), so lines stay in order even if two requests arrive out of order.
export async function pushLine({ code, seq, english, config, speed }) {
  await pipe([["ZADD", k(code, "seqs"), String(seq), String(seq)], ["EXPIRE", k(code, "seqs"), ROOM_TTL]]);
  const prevSeqs = [seq - 1, seq - 2, seq - 3, seq - 4].filter((n) => n > 0).reverse();

  const [, , langs, prev] = await pipe([
    ["HSET", k(code, "en"), String(seq), english],
    ["EXPIRE", k(code, "en"), ROOM_TTL],
    ["SMEMBERS", k(code, "langs")],
    prevSeqs.length ? ["HMGET", k(code, "en"), ...prevSeqs.map(String)] : ["GET", k(code, "none")],
  ]);
  const context = Array.isArray(prev) ? prev : [];

  const languages = (langs || []).filter((l) => LANGUAGES[l]);
  const results = await Promise.all(
    languages.map((language) => processLanguage({ code, seq, english, context, language, config, speed })),
  );
  return { seq, languages: Object.fromEntries(languages.map((l, i) => [l, results[i]])) };
}

async function processLanguage({ code, seq, english, context, language, config, speed }) {
  const tKey = k(code, `t:${language}`);
  const save = (obj) => pipe([["HSET", tKey, String(seq), JSON.stringify(obj)], ["EXPIRE", tKey, ROOM_TTL]]);
  let text;
  try {
    text = await translateLine({ english, context, language, apiKey: config.anthropicKey, model: config.anthropicLiveModel });
  } catch (err) {
    console.error("live translate error:", language, err);
    await save({ error: true });
    return { ok: false, error: err.message };
  }
  if (!text) {
    await save({ skip: true });
    return { ok: true, skipped: true };
  }

  const canVoice = Boolean(config.elevenKey && config.elevenVoiceId);
  // Save the words first so captions show up while the voice is being made.
  await save({ text, audio: canVoice ? "pending" : "none" });
  if (!canVoice) return { ok: true, voice: false };

  try {
    const audio = await synthesize({
      text,
      apiKey: config.elevenKey,
      voiceId: config.elevenVoiceId,
      model: config.elevenLiveModel,
      speed,
      format: "mp3_44100_64",
    });
    const aKey = k(code, `a:${language}:${seq}`);
    await pipe([
      ["SET", aKey, audio.toString("base64"), "EX", ROOM_TTL],
      ["HSET", tKey, String(seq), JSON.stringify({ text, audio: "ready" })],
    ]);
    return { ok: true, voice: true };
  } catch (err) {
    await save({ text, audio: "failed" });
    return { ok: false, error: err.message, voiceFailed: true };
  }
}

// A listener checks for new lines. `after` = last line number they have;
// -1 means "just joined, start from now".
export async function poll({ code, language, after, listenerId }) {
  const now = Date.now();
  const [metaRaw, top, isMember, langCount] = await pipe([
    ["GET", k(code, "meta")],
    ["ZREVRANGE", k(code, "seqs"), "0", "0", "WITHSCORES"],
    ["SISMEMBER", k(code, "langs"), language],
    ["SCARD", k(code, "langs")],
  ]);
  if (!metaRaw) return { status: 404, error: "notFound" };
  const meta = JSON.parse(metaRaw);
  const count = top && top.length ? Number(top[1]) : 0;

  if (!isMember) {
    if (langCount >= MAX_LANGUAGES) return { status: 409, error: "tooManyLanguages" };
  }
  await pipe([
    ["SADD", k(code, "langs"), language],
    ["EXPIRE", k(code, "langs"), ROOM_TTL],
    ["ZADD", k(code, "listeners"), String(now), `${listenerId}:${language}`],
    ["EXPIRE", k(code, "listeners"), ROOM_TTL],
  ]);

  const start = after < 0 ? count + 1 : after + 1;
  const end = Math.min(count, start + 29);
  let lines = [];
  if (end >= start) {
    const seqs = [];
    for (let s = start; s <= end; s++) seqs.push(String(s));
    const [values] = await pipe([["HMGET", k(code, `t:${language}`), ...seqs]]);
    lines = seqs.map((s, i) => {
      const v = values && values[i];
      if (!v) return { seq: Number(s), pending: true };
      return { seq: Number(s), ...JSON.parse(v) };
    });
  }
  return { status: 200, ended: Boolean(meta.ended), count, from: after < 0 ? count : after, lines };
}

export async function getAudio({ code, language, seq }) {
  const b64 = await cmd("GET", k(code, `a:${language}:${seq}`));
  return b64 ? Buffer.from(b64, "base64") : null;
}

export async function roomStatus(code) {
  const since = Date.now() - LISTENER_WINDOW_MS;
  const [members, top] = await pipe([
    ["ZRANGEBYSCORE", k(code, "listeners"), String(since), "+inf"],
    ["ZREVRANGE", k(code, "seqs"), "0", "0", "WITHSCORES"],
  ]);
  const count = top && top.length ? Number(top[1]) : 0;
  const byLanguage = {};
  for (const m of members || []) {
    const lang = String(m).split(":").pop();
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
  }
  return { listeners: (members || []).length, byLanguage, lines: Number(count || 0) };
}
