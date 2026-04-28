// In-memory ring buffer that captures recent console output so the admin
// dashboard can show the live server log without us having to read files
// on disk. Capacity is fixed; oldest entries are dropped first.

const CAPACITY = 1000;
const buf = [];
let nextId = 1;
const subscribers = new Set();

function push(level, args) {
  const text = args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || a.message;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(" ");
  const entry = { id: nextId++, ts: Date.now(), level, text };
  buf.push(entry);
  if (buf.length > CAPACITY) buf.splice(0, buf.length - CAPACITY);
  if (subscribers.size) {
    // Async fan-out so a slow subscriber can never block console output.
    queueMicrotask(() => {
      for (const fn of subscribers) {
        try { fn(entry); } catch {}
      }
    });
  }
}

// Subscribe to every new log entry. Returns an unsubscribe function.
export function onLog(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function installLogCapture() {
  const orig = {
    log: console.log.bind(console),
    info: console.info ? console.info.bind(console) : console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...a) => { push("info", a); orig.log(...a); };
  console.info = (...a) => { push("info", a); orig.info(...a); };
  console.warn = (...a) => { push("warn", a); orig.warn(...a); };
  console.error = (...a) => { push("error", a); orig.error(...a); };
}

// Read entries newer than `sinceId` (exclusive). Optional level / substring filter.
// `level` accepts "all", a single level, or a comma-separated list (e.g. "warn,error").
export function getLogs({ sinceId = 0, level = "all", q = "", limit = 500 } = {}) {
  const raw = String(level || "all").toLowerCase();
  const allowed = raw === "all" ? null : new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  const needle = String(q || "").toLowerCase();
  const out = [];
  for (let i = buf.length - 1; i >= 0 && out.length < limit; i--) {
    const e = buf[i];
    if (e.id <= sinceId) break;
    if (allowed && !allowed.has(e.level)) continue;
    if (needle && !e.text.toLowerCase().includes(needle)) continue;
    out.push(e);
  }
  out.reverse();
  const lastId = buf.length ? buf[buf.length - 1].id : 0;
  return { entries: out, lastId, capacity: CAPACITY, total: buf.length };
}

export function clearLogs() {
  buf.length = 0;
}
