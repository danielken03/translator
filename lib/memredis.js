// In-memory stand-in for Redis, used only for local tests.
// Supports just the commands the live rooms use.

export function createMemoryRedis() {
  const data = new Map();
  const run = ([name, ...a]) => {
    const n = name.toUpperCase();
    const k = a[0];
    switch (n) {
      case "SET": {
        const nx = a.map(String).map((x) => x.toUpperCase()).includes("NX");
        if (nx && data.has(k)) return null;
        data.set(k, String(a[1]));
        return "OK";
      }
      case "GET": return data.has(k) ? data.get(k) : null;
      case "INCR": { const v = Number(data.get(k) || 0) + 1; data.set(k, String(v)); return v; }
      case "EXPIRE": return data.has(k) ? 1 : 0;
      case "DEL": return a.reduce((c, key) => c + (data.delete(key) ? 1 : 0), 0);
      case "HSET": { const h = data.get(k) || new Map(); for (let i = 1; i < a.length; i += 2) h.set(String(a[i]), String(a[i + 1])); data.set(k, h); return 1; }
      case "HGET": { const h = data.get(k); return h && h.has(String(a[1])) ? h.get(String(a[1])) : null; }
      case "HMGET": { const h = data.get(k); return a.slice(1).map((f) => (h && h.has(String(f)) ? h.get(String(f)) : null)); }
      case "SADD": { const s = data.get(k) || new Set(); let added = 0; for (const m of a.slice(1)) if (!s.has(m)) { s.add(m); added++; } data.set(k, s); return added; }
      case "SISMEMBER": { const s = data.get(k); return s && s.has(a[1]) ? 1 : 0; }
      case "SCARD": { const s = data.get(k); return s ? s.size : 0; }
      case "SMEMBERS": { const s = data.get(k); return s ? [...s] : []; }
      case "ZADD": { const z = data.get(k) || new Map(); z.set(a[2], Number(a[1])); data.set(k, z); return 1; }
      case "ZREVRANGE": { const z = data.get(k); if (!z) return []; const sorted = [...z.entries()].sort((x, y) => y[1] - x[1]).slice(Number(a[1]), Number(a[2]) + 1); return a.map(String).map((x) => x.toUpperCase()).includes("WITHSCORES") ? sorted.flatMap(([m, sc]) => [m, String(sc)]) : sorted.map(([m]) => m); }
      case "ZRANGEBYSCORE": { const z = data.get(k); if (!z) return []; const lo = Number(a[1]); return [...z.entries()].filter(([, s]) => s >= lo).map(([m]) => m); }
      default: throw new Error(`memredis: unsupported ${n}`);
    }
  };
  return async (commands) => commands.map(run);
}
