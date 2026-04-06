/**
 * matchListEnvelope.js — Wrap Cricket Live Line list API response with schema v1 + pulseMatches[]
 *
 * New API response shape:
 *   { status: 'ok', response: { items: [ ...match items... ] } }
 *
 * The typeMatches field is always returned as [] for backward compatibility
 * with any clients that reference it, but is never populated.
 */

'use strict';

const { matchItemToPulse } = require('./pulseMatchV1');

/**
 * Extract the flat items array from the new API response.
 * @param {object} raw — top-level API response
 * @returns {object[]}
 */
function collectMatchItems(raw) {
  return raw?.response?.items ?? [];
}

/**
 * @param {object} rawResponse — top-level response from Cricket Live Line matches endpoint
 * @param {number} [nowMs]
 * @returns {{ schemaVersion: number, source: string, pulseMatches: object[], typeMatches: [] }}
 */
function enrichMatchListResponse(rawResponse, nowMs = Date.now()) {
  const raw = rawResponse || {};
  const items = collectMatchItems(raw);
  const pulseMatches = items
    .map((item) => matchItemToPulse(item, nowMs))
    .filter(Boolean);
  return {
    schemaVersion: 1,
    source: 'cricket-live-line',
    pulseMatches,
    typeMatches: [],
  };
}

/**
 * Empty envelope when cache has no data yet.
 */
function emptyMatchListEnvelope() {
  return {
    schemaVersion: 1,
    source: 'cricket-live-line',
    pulseMatches: [],
    typeMatches: [],
  };
}

module.exports = {
  enrichMatchListResponse,
  collectMatchItems,
  emptyMatchListEnvelope,
};
