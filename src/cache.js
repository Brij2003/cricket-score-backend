/**
 * cache.js
 * ─────────
 * Lightweight in-memory cache with TTL (time-to-live) support.
 *
 * Each entry stores: { data, hash, expiresAt }
 *
 * Redis upgrade path:
 *   When you need persistence across restarts or horizontal scaling,
 *   swap this module for an ioredis implementation — the interface is identical.
 *
 * Usage:
 *   cache.set('liveMatches', data, 35)   // TTL in seconds
 *   cache.get('liveMatches')             // returns data or null if expired
 *   cache.getHash('liveMatches')         // returns hash string for diff detection
 *   cache.isValid('liveMatches')         // true if key exists and not expired
 */

const crypto = require('crypto');

const store = new Map(); // key → { data, hash, expiresAt }

/**
 * Store data with a TTL (seconds).
 * Computes a SHA-256 hash of the JSON for change detection.
 */
function set(key, data, ttlSeconds) {
  const json = JSON.stringify(data);
  const hash = crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
  store.set(key, {
    data,
    hash,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return hash;
}

/**
 * Get cached data. Returns null if missing or expired.
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Returns the short hash of a cached entry (for change detection).
 * Returns null if key doesn't exist or is expired.
 */
function getHash(key) {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.hash;
}

/**
 * True if key exists in cache and hasn't expired.
 */
function isValid(key) {
  return get(key) !== null;
}

/**
 * Returns a summary of all cache entries (for health/debug endpoint).
 */
function stats() {
  const now = Date.now();
  const result = {};
  for (const [key, entry] of store.entries()) {
    const ttlRemaining = Math.max(0, Math.round((entry.expiresAt - now) / 1000));
    result[key] = {
      hash: entry.hash,
      ttlRemainingSeconds: ttlRemaining,
      expired: ttlRemaining === 0,
    };
  }
  return result;
}

module.exports = { set, get, getHash, isValid, stats };
