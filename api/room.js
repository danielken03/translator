import { getConfig, checkPasscode, readJson, sendJson } from "../lib/config.js";
import { redisReady } from "../lib/redis.js";
import {
  createRoom, checkHost, endRoom, pushLine, poll, getAudio, roomStatus, normalizeCode, MAX_LINE_CHARS,
} from "../lib/live.js";
import { LANGUAGES } from "../public/languages.js";

// Live rooms, all in one function:
//   POST ?action=create            speaker (passcode)        → { code, hostToken }
//   POST ?action=push&code=        speaker (passcode+token)  → translates + voices a line
//   POST ?action=end&code=         speaker                   → ends the room
//   GET  ?action=status&code=      speaker                   → who's listening
//   GET  ?action=poll&code=&lang=&after=&id=   listeners     → new lines
//   GET  ?action=audio&code=&lang=&seq=        listeners     → one line's audio

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const q = Object.fromEntries(url.searchParams);
  const action = q.action || "";

  if (!redisReady()) {
    return sendJson(res, 503, { error: "Live rooms aren't set up yet. Add Upstash Redis to the project in Vercel (see README)." });
  }

  const config = getConfig(req);
  const code = normalizeCode(q.code);

  try {
    // ----- listeners (no passcode; the room code is the access) -----
    if (action === "poll") {
      if (!code) return sendJson(res, 404, { error: "notFound" });
      const language = String(q.lang || "");
      if (!LANGUAGES[language]) return sendJson(res, 400, { error: "badLanguage" });
      const listenerId = String(q.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "anon";
      const after = Number.isFinite(Number(q.after)) ? Math.floor(Number(q.after)) : -1;
      const out = await poll({ code, language, after, listenerId });
      if (out.status !== 200) return sendJson(res, out.status, { error: out.error });
      delete out.status;
      return sendJson(res, 200, out);
    }

    if (action === "audio") {
      const language = String(q.lang || "");
      const seq = Math.floor(Number(q.seq));
      if (!code || !LANGUAGES[language] || !(seq > 0)) return sendJson(res, 400, { error: "Bad request." });
      const audio = await getAudio({ code, language, seq });
      if (!audio) return sendJson(res, 404, { error: "Not ready." });
      res.statusCode = 200;
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Content-Length", audio.length);
      return res.end(audio);
    }

    // ----- speaker -----
    if (!checkPasscode(req, config)) return sendJson(res, 401, { error: "Wrong passcode." });

    if (action === "create") {
      if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });
      if (!config.anthropicKey) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY is not set in Vercel." });
      const room = await createRoom();
      return sendJson(res, 200, room);
    }

    if (!code) return sendJson(res, 400, { error: "Missing room code." });
    const host = await checkHost(code, req.headers["x-room-token"]);
    if (host.error) return sendJson(res, host.status, { error: host.error });

    if (action === "status") {
      return sendJson(res, 200, { ...(await roomStatus(code)), ended: Boolean(host.meta.ended) });
    }

    if (action === "end") {
      await endRoom(code);
      return sendJson(res, 200, { ok: true });
    }

    if (action === "push") {
      if (req.method !== "POST") return sendJson(res, 405, { error: "Use POST." });
      if (host.meta.ended) return sendJson(res, 409, { error: "This room has ended." });
      const body = await readJson(req);
      const english = String(body.english || "").trim().slice(0, MAX_LINE_CHARS);
      if (!english) return sendJson(res, 400, { error: "Nothing to send." });
      const seq = Math.floor(Number(body.seq));
      if (!(seq > 0 && seq < 100000)) return sendJson(res, 400, { error: "Bad line number." });
      const out = await pushLine({ code, seq, english, config, speed: body.speed });
      return sendJson(res, 200, out);
    }

    return sendJson(res, 400, { error: "Unknown action." });
  } catch (err) {
    console.error("room error:", action, err);
    return sendJson(res, 500, { error: err.message || "Something went wrong." });
  }
}
