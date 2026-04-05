/**
 * broadcaster.js
 * ───────────────
 * Manages the set of connected WebSocket clients and broadcasts messages.
 *
 * Fan-out pattern:
 *   1 server poll → N clients receive the update simultaneously
 *
 * This is the core of the "serve 100-200 concurrent clients from 1 API call"
 * strategy. All connected sockets live in a lightweight Set.
 *
 * Message format sent to clients:
 * {
 *   "type": "live" | "upcoming" | "recent" | "rankings" | "scorecard" | "snapshot",
 *   "data": { ... },
 *   "timestamp": 1234567890
 * }
 */

'use strict';

/** @type {Set<import('ws').WebSocket>} */
const clients = new Set();

/**
 * Register a newly connected WebSocket client.
 * Automatically removes it from the set when it closes.
 */
function register(socket) {
  clients.add(socket);

  socket.on('close', () => {
    clients.delete(socket);
    console.log(`[WS] Client disconnected. Active connections: ${clients.size}`);
  });

  socket.on('error', (err) => {
    console.error('[WS] Socket error:', err.message);
    clients.delete(socket);
  });

  console.log(`[WS] Client connected. Active connections: ${clients.size}`);
}

/**
 * Send a typed message to all connected clients.
 *
 * @param {'live'|'upcoming'|'recent'|'rankings'|'scorecard'|'snapshot'} type
 * @param {object} data
 */
function broadcast(type, data) {
  if (clients.size === 0) return; // nothing to do

  const payload = JSON.stringify({
    type,
    data,
    timestamp: Date.now(),
  });

  let sent = 0;
  let dead = 0;

  for (const socket of clients) {
    // Only send to sockets that are in OPEN state (readyState === 1)
    if (socket.readyState === 1 /* WebSocket.OPEN */) {
      try {
        socket.send(payload);
        sent++;
      } catch (err) {
        console.error('[WS] Failed to send to client:', err.message);
        clients.delete(socket);
        dead++;
      }
    } else {
      // Clean up stale sockets
      clients.delete(socket);
      dead++;
    }
  }

  if (sent > 0) {
    console.log(`[WS] Broadcast type="${type}" → ${sent} clients (${dead} cleaned up)`);
  }
}

/**
 * Send a message to a single socket (used for initial snapshot on connect).
 *
 * @param {import('ws').WebSocket} socket
 * @param {'live'|'upcoming'|'recent'|'rankings'|'snapshot'} type
 * @param {object} data
 */
function sendToOne(socket, type, data) {
  if (socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify({ type, data, timestamp: Date.now() }));
  } catch (err) {
    console.error('[WS] Failed to send snapshot:', err.message);
  }
}

/** Returns the number of active connected clients. */
function connectionCount() {
  return clients.size;
}

module.exports = { register, broadcast, sendToOne, connectionCount };
