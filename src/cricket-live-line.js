/**
 * cricket-live-line.js
 * ─────────────────────
 * All Cricket Live Line Advance RapidAPI calls live here and nowhere else.
 * API host: cricket-live-line-advance.p.rapidapi.com
 * Key is read from RAPIDAPI_KEY environment variable — never hardcoded.
 *
 * Commentary is a 2-step fetch:
 *   1. GET /matches/{id}/info  → latest_inning_number
 *   2. GET /matches/{id}/innings/{n}/commentary
 */

'use strict';

const axios = require('axios');

const BASE_URL = 'https://cricket-live-line-advance.p.rapidapi.com';

function getHeaders() {
  return {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'x-rapidapi-host': 'cricket-live-line-advance.p.rapidapi.com',
  };
}

async function apiGet(path) {
  const url = `${BASE_URL}${path}`;
  try {
    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 10000,
    });
    return response.data;
  } catch (err) {
    if (err.response) {
      throw new Error(
        `Cricket Live Line API error [${err.response.status}] for ${path}: ${JSON.stringify(err.response.data)}`
      );
    }
    throw new Error(`Network error fetching ${path}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────
//  MATCH LISTS
//  status=3 → live, status=2 → completed/recent, status=1 → upcoming
// ─────────────────────────────────────────────────

const getLiveMatches = () =>
  apiGet('/matches?status=3&per_paged=50&paged=1&highlight_live_matches=1');

const getUpcomingMatches = () =>
  apiGet('/matches?status=1&per_paged=50&paged=1');

const getRecentMatches = () =>
  apiGet('/matches?status=2&per_paged=50&paged=1');

// ─────────────────────────────────────────────────
//  MATCH DETAILS (on-demand)
// ─────────────────────────────────────────────────

/** Returns match metadata */
const getMatchInfo = (matchId) => apiGet(`/matches/${matchId}/info`);

/** Returns full scorecard with innings breakdowns */
const getMatchAdvance = (matchId) => apiGet(`/matches/${matchId}/advance`);

/**
 * Returns live commentary for the current innings.
 * Fetches match info first to determine latest_inning_number.
 */
async function getCommentary(matchId) {
  const info = await apiGet(`/matches/${matchId}/info`);
  const inningsId = info?.response?.latest_inning_number ?? 1;
  return apiGet(`/matches/${matchId}/innings/${inningsId}/commentary`);
}

module.exports = {
  getLiveMatches,
  getUpcomingMatches,
  getRecentMatches,
  getMatchInfo,
  getMatchAdvance,
  getCommentary,
};
