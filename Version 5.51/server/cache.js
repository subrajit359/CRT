/**
 * Lightweight in-memory TTL cache.
 * No external dependencies — values live in a Map and expire automatically.
 *
 * Usage:
 *   import { cacheGet, cacheSet, cacheInvalidate } from "./cache.js";
 *
 *   const v = cacheGet("my-key");
 *   cacheSet("my-key", value, 60_000);   // TTL in ms, default 60 s
 *   cacheInvalidate("cases:");           // deletes all keys that start with prefix
 */

const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = 60_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key) {
  store.delete(key);
}

export function cacheInvalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function cacheStats() {
  const now = Date.now();
  let alive = 0;
  for (const entry of store.values()) {
    if (now <= entry.expiresAt) alive++;
  }
  return { total: store.size, alive };
}
