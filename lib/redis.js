// Tiny Upstash Redis client (REST API) — no extra packages needed.
// Vercel's Upstash integration sets either KV_REST_API_URL/KV_REST_API_TOKEN
// or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN; both work.

let override = null;

// For local testing: swap in an in-memory Redis.
export function _setRedisExecutor(fn) {
  override = fn;
}

function settings() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
  };
}

export function redisReady() {
  const s = settings();
  return Boolean(override || (s.url && s.token));
}

// Run several commands in one round trip. Returns each command's result.
export async function pipe(commands) {
  if (override) return override(commands);
  const { url, token } = settings();
  const resp = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!resp.ok) throw new Error(`Room storage error (${resp.status}).`);
  const out = await resp.json();
  return out.map((r) => {
    if (r.error) throw new Error(`Room storage error: ${r.error}`);
    return r.result;
  });
}

export async function cmd(...args) {
  return (await pipe([args]))[0];
}
