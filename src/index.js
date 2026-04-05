/**
 * index.js — Cricket Score Backend
 * ──────────────────────────────────
 * Lightweight Fastify server with:
 *   - REST endpoints for initial data load
 *   - WebSocket endpoint for realtime score pushes
 *   - Smart polling scheduler (only polls CricBuzz, not each client)
 *   - In-memory cache (Redis-ready upgrade path)
 *
 * Handles 100-200 concurrent WebSocket connections easily on a free-tier server.
 * Maximum CricBuzz API usage: ~3 calls/minute regardless of user count.
 */

'use strict';

require('dotenv').config();

const Fastify = require('fastify');
const cache      = require('./cache');
const scheduler  = require('./scheduler');
const broadcaster = require('./broadcaster');
const cricbuzz   = require('./cricbuzz');

// ── Validate environment ──────────────────────────────────────────────────
if (!process.env.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY === 'your_rapidapi_key_here') {
  console.error('⛔ RAPIDAPI_KEY is not set in environment! Copy .env.example → .env and add your key.');
  process.exit(1);
}

// ── Create Fastify instance ───────────────────────────────────────────────
const fastify = Fastify({
  logger: {
    level: 'warn', // keep logs quiet; change to 'info' for debugging
  },
});

// ── Register plugins ──────────────────────────────────────────────────────
fastify.register(require('@fastify/cors'), {
  origin: process.env.CORS_ORIGIN ?? '*',
});

fastify.register(require('@fastify/websocket'));

// ─────────────────────────────────────────────────────────────────────────
//  WEBSOCKET ENDPOINT
//  Flutter clients connect here and receive realtime score pushes.
//  URL: ws://your-server/ws
// ─────────────────────────────────────────────────────────────────────────
fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (socket /*, req */) => {
    // Register the socket for future broadcasts
    broadcaster.register(socket);

    // Immediately send the current cached state as a snapshot
    // so the client has data before the next scheduled poll
    const snapshot = {
      live:     cache.get('live')     ?? [],
      upcoming: cache.get('upcoming') ?? [],
      recent:   cache.get('recent')   ?? [],
      rankings: cache.get('rankings') ?? {},
    };
    broadcaster.sendToOne(socket, 'snapshot', snapshot);

    // Handle messages from clients (e.g., requesting a specific scorecard)
    socket.on('message', async (rawMessage) => {
      try {
        const msg = JSON.parse(rawMessage.toString());

        if (msg.type === 'getScorecard' && msg.matchId) {
          const cacheKey = `scorecard_${msg.matchId}`;
          let data = cache.get(cacheKey);

          if (!data) {
            // Fetch on-demand — only happens once per match, then cached
            data = await cricbuzz.getScorecard(msg.matchId);
            cache.set(cacheKey, data, 35); // 35s TTL
          }
          broadcaster.sendToOne(socket, 'scorecard', { matchId: msg.matchId, ...data });
        }

        if (msg.type === 'getCommentary' && msg.matchId) {
          const data = await cricbuzz.getLiveCommentary(msg.matchId);
          broadcaster.sendToOne(socket, 'commentary', { matchId: msg.matchId, ...data });
        }

      } catch (err) {
        console.error('[WS] Failed to handle client message:', err.message);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
//  REST ENDPOINTS
//  Used for one-off fetches or clients that don't use WebSocket.
// ─────────────────────────────────────────────────────────────────────────

/** Health check — used by Railway/Render to verify the server is running */
fastify.get('/health', async () => ({
  status: 'ok',
  uptime: Math.round(process.uptime()),
  connections: broadcaster.connectionCount(),
  cache: cache.stats(),
  timestamp: Date.now(),
}));

/** Live matches — returns cached data instantly */
fastify.get('/api/live', async (req, reply) => {
  const data = cache.get('live');
  if (!data) return reply.code(503).send({ error: 'Cache not yet warm. Retry in a moment.' });
  return data;
});

/** Upcoming matches */
fastify.get('/api/upcoming', async (req, reply) => {
  const data = cache.get('upcoming');
  if (!data) return reply.code(503).send({ error: 'Cache not yet warm.' });
  return data;
});

/** Recent matches */
fastify.get('/api/recent', async (req, reply) => {
  const data = cache.get('recent');
  if (!data) return reply.code(503).send({ error: 'Cache not yet warm.' });
  return data;
});

/** Rankings — all formats and categories */
fastify.get('/api/rankings', async (req, reply) => {
  const data = cache.get('rankings');
  if (!data) return reply.code(503).send({ error: 'Cache not yet warm.' });
  return data;
});

/**
 * Scorecard for a specific match (on-demand with 35s cache)
 * GET /api/scorecard/:matchId
 */
fastify.get('/api/scorecard/:matchId', async (req, reply) => {
  const { matchId } = req.params;
  const cacheKey = `scorecard_${matchId}`;

  let data = cache.get(cacheKey);
  if (!data) {
    try {
      data = await cricbuzz.getScorecard(matchId);
      cache.set(cacheKey, data, 35);
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  }
  return data;
});

/**
 * Match info (on-demand)
 * GET /api/match/:matchId
 */
fastify.get('/api/match/:matchId', async (req, reply) => {
  const { matchId } = req.params;
  const cacheKey = `matchinfo_${matchId}`;

  let data = cache.get(cacheKey);
  if (!data) {
    try {
      data = await cricbuzz.getMatchInfo(matchId);
      cache.set(cacheKey, data, 60);
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  }
  return data;
});

/**
 * Live commentary (always fresh — short TTL)
 * GET /api/commentary/:matchId
 */
fastify.get('/api/commentary/:matchId', async (req, reply) => {
  const { matchId } = req.params;
  try {
    const data = await cricbuzz.getLiveCommentary(matchId);
    return data;
  } catch (err) {
    return reply.code(502).send({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  STARTUP
// ─────────────────────────────────────────────────────────────────────────
async function start() {
  const port = parseInt(process.env.PORT ?? '3000', 10);

  try {
    // 1. Warm the cache before accepting connections
    await scheduler.warmCache();

    // 2. Bind the HTTP/WebSocket server (before scheduler so EADDRINUSE does not leave timers running)
    await fastify.listen({ port, host: '0.0.0.0' });

    // 3. Start polling only after the port is bound
    scheduler.start();

    console.log(`\n🏏 Cricket Score Backend running on port ${port}`);
    console.log(`   Health:    http://localhost:${port}/health`);
    console.log(`   WebSocket: ws://localhost:${port}/ws`);
    console.log(`   Live:      http://localhost:${port}/api/live`);
    console.log(`   Upcoming:  http://localhost:${port}/api/upcoming`);
    console.log(`   Recent:    http://localhost:${port}/api/recent`);
    console.log(`   Rankings:  http://localhost:${port}/api/rankings\n`);
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Failed to start server: port ${port} is already in use.\n` +
          `  Stop the other process (e.g. another node src/index.js) or set PORT=3001 in .env`
      );
    } else {
      console.error('Failed to start server:', err);
    }
    process.exit(1);
  }
}

start();
