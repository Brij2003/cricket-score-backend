/**
 * scheduler.js
 * ─────────────
 * Smart polling engine. Fetches data from CricBuzz on fixed intervals
 * and only broadcasts to clients when the data has actually changed.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Data type     │  Poll interval  │  CricBuzz calls/min      │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Live matches  │  30 s           │  2                        │
 * │  Upcoming      │  5 min          │  0.2                      │
 * │  Recent        │  10 min         │  0.1                      │
 * │  Rankings      │  60 min         │  0.05                     │
 * │  TOTAL                           │  ~2.35 calls/min          │
 * │  (regardless of connected users) │                           │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Compare with client-side polling at 200 users × 2 calls/min = 400 calls/min.
 */

'use strict';

const cron = require('node-cron');
const cricbuzz = require('./cricbuzz');
const cache = require('./cache');
const broadcaster = require('./broadcaster');

// TTL slightly longer than poll interval to ensure cache is always warm
const TTL = {
  live: 35,        // seconds
  upcoming: 310,
  recent: 620,
  rankings: 3650,
};

/**
 * Fetch a data type, compare hash, update cache, broadcast if changed.
 * @param {string} cacheKey   - cache key name
 * @param {Function} fetcher  - async function that returns data
 * @param {string} broadcastType - WebSocket event type sent to clients
 * @param {number} ttl        - cache TTL in seconds
 */
async function fetchAndUpdate(cacheKey, fetcher, broadcastType, ttl) {
  try {
    const previousHash = cache.getHash(cacheKey);
    const data = await fetcher();
    const newHash = cache.set(cacheKey, data, ttl);

    if (newHash !== previousHash) {
      console.log(`[Scheduler] ${cacheKey} CHANGED (${previousHash?.slice(0,6) ?? 'new'} → ${newHash.slice(0,6)}) — broadcasting`);
      broadcaster.broadcast(broadcastType, data);
    } else {
      console.log(`[Scheduler] ${cacheKey} unchanged — skipping broadcast`);
    }
  } catch (err) {
    console.error(`[Scheduler] Error fetching ${cacheKey}:`, err.message);
    // Cache is still valid from last successful fetch — clients keep seeing old data
    // rather than receiving an error
  }
}

/**
 * Fetch all rankings (bat/bowl/allrounder × test/odi/t20 = 9 calls).
 * Wrapped into a single cache entry and broadcast event.
 */
async function fetchAllRankings() {
  try {
    const previousHash = cache.getHash('rankings');
    const formats = ['test', 'odi', 't20'];
    const [batsmen, bowlers, allrounders] = await Promise.all([
      Promise.all(formats.map(f => cricbuzz.getBatsmenRankings(f).catch(() => null))),
      Promise.all(formats.map(f => cricbuzz.getBowlerRankings(f).catch(() => null))),
      Promise.all(formats.map(f => cricbuzz.getAllRounderRankings(f).catch(() => null))),
    ]);

    const data = {
      batsmen: { test: batsmen[0], odi: batsmen[1], t20: batsmen[2] },
      bowlers:  { test: bowlers[0], odi: bowlers[1], t20: bowlers[2] },
      allrounders: { test: allrounders[0], odi: allrounders[1], t20: allrounders[2] },
    };

    const newHash = cache.set('rankings', data, TTL.rankings);
    if (newHash !== previousHash) {
      console.log(`[Scheduler] rankings CHANGED — broadcasting`);
      broadcaster.broadcast('rankings', data);
    }
  } catch (err) {
    console.error('[Scheduler] Error fetching rankings:', err.message);
  }
}

/**
 * Initial data load — called once on server startup.
 * Populates all caches immediately so the first client gets data right away.
 */
async function warmCache() {
  console.log('[Scheduler] Warming cache on startup...');
  await Promise.allSettled([
    fetchAndUpdate('live',     cricbuzz.getLiveMatches,     'live',     TTL.live),
    fetchAndUpdate('upcoming', cricbuzz.getUpcomingMatches, 'upcoming', TTL.upcoming),
    fetchAndUpdate('recent',   cricbuzz.getRecentMatches,   'recent',   TTL.recent),
    fetchAllRankings(),
  ]);
  console.log('[Scheduler] Cache warm — server ready to accept clients');
}

/**
 * Start all polling jobs.
 * Intervals are read from env vars so you can tune without code changes.
 */
function start() {
  const liveSecs     = parseInt(process.env.LIVE_POLL_SECONDS     ?? '30',   10);
  const upcomingSecs = parseInt(process.env.UPCOMING_POLL_SECONDS ?? '300',  10);
  const recentSecs   = parseInt(process.env.RECENT_POLL_SECONDS   ?? '600',  10);
  const rankingsSecs = parseInt(process.env.RANKINGS_POLL_SECONDS ?? '3600', 10);

  // ── Live matches — most frequent ─────────────────────────────
  // node-cron doesn't support sub-minute intervals with cron syntax,
  // so we use setInterval for sub-60s polling.
  setInterval(
    () => fetchAndUpdate('live', cricbuzz.getLiveMatches, 'live', TTL.live),
    liveSecs * 1000
  );
  console.log(`[Scheduler] Live matches: every ${liveSecs}s`);

  // ── Upcoming matches ─────────────────────────────────────────
  setInterval(
    () => fetchAndUpdate('upcoming', cricbuzz.getUpcomingMatches, 'upcoming', TTL.upcoming),
    upcomingSecs * 1000
  );
  console.log(`[Scheduler] Upcoming matches: every ${upcomingSecs}s`);

  // ── Recent matches ────────────────────────────────────────────
  setInterval(
    () => fetchAndUpdate('recent', cricbuzz.getRecentMatches, 'recent', TTL.recent),
    recentSecs * 1000
  );
  console.log(`[Scheduler] Recent matches: every ${recentSecs}s`);

  // ── Rankings — slowest ────────────────────────────────────────
  setInterval(fetchAllRankings, rankingsSecs * 1000);
  console.log(`[Scheduler] Rankings: every ${rankingsSecs}s`);
}

module.exports = { start, warmCache, fetchAllRankings };
