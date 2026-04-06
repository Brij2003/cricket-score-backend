/**
 * matchListEnvelope.js — Wrap CricBuzz list API response with schema v1 + pulseMatches[]
 */

'use strict';

const { matchWrapperToPulse } = require('./pulseMatchV1');

/**
 * Walk typeMatches tree and collect match objects { matchInfo, matchScore }.
 * @param {object} raw — top-level CricBuzz response
 * @returns {object[]}
 */
function collectMatchWrappers(raw) {
  const out = [];
  const typeMatches = raw.typeMatches || [];
  for (const type of typeMatches) {
    const seriesMatches = type.seriesMatches || [];
    for (const series of seriesMatches) {
      const wrapper = series.seriesAdWrapper || series;
      const matches = wrapper.matches || [];
      for (const m of matches) {
        out.push(m);
      }
    }
  }
  return out;
}

/**
 * @param {object} rawCricbuzzResponse
 * @param {number} [nowMs]
 * @returns {{ schemaVersion: number, source: string, pulseMatches: object[], typeMatches: unknown[] }}
 */
function enrichMatchListResponse(rawCricbuzzResponse, nowMs = Date.now()) {
  const raw = rawCricbuzzResponse || {};
  const wrappers = collectMatchWrappers(raw);
  const pulseMatches = wrappers.map((w) => matchWrapperToPulse(w, nowMs));
  return {
    schemaVersion: 1,
    source: 'cricbuzz',
    pulseMatches,
    typeMatches: raw.typeMatches ?? [],
  };
}

/**
 * Empty envelope when cache has no data yet (must be object, not []).
 */
function emptyMatchListEnvelope() {
  return {
    schemaVersion: 1,
    source: 'cricbuzz',
    pulseMatches: [],
    typeMatches: [],
  };
}

module.exports = {
  enrichMatchListResponse,
  collectMatchWrappers,
  emptyMatchListEnvelope,
};
