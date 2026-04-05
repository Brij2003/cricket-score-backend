/**
 * cricbuzz.js
 * ─────────────
 * All CricBuzz RapidAPI calls live here and nowhere else.
 * The API key is read from environment variables — it never leaves the server.
 *
 * Every function returns parsed JSON or throws with a clear message.
 */

const axios = require('axios');

const BASE_URL = 'https://cricbuzz-cricket.p.rapidapi.com';

// Build headers once — key is read from env, never hardcoded
function getHeaders() {
  return {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'x-rapidapi-host': 'cricbuzz-cricket.p.rapidapi.com',
  };
}

/**
 * Generic GET wrapper with error handling.
 * Throws a descriptive error on non-200 responses.
 */
async function apiGet(path) {
  const url = `${BASE_URL}${path}`;
  try {
    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 10000, // 10 second timeout
    });
    return response.data;
  } catch (err) {
    if (err.response) {
      throw new Error(
        `CricBuzz API error [${err.response.status}] for ${path}: ${JSON.stringify(err.response.data)}`
      );
    }
    throw new Error(`Network error fetching ${path}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────
//  MATCH LISTS
// ─────────────────────────────────────────────────

/** Returns live matches */
const getLiveMatches = () => apiGet('/matches/v1/live');

/** Returns upcoming matches */
const getUpcomingMatches = () => apiGet('/matches/v1/upcoming');

/** Returns recently completed matches */
const getRecentMatches = () => apiGet('/matches/v1/recent');

// ─────────────────────────────────────────────────
//  MATCH DETAILS (fetched on-demand, not scheduled)
// ─────────────────────────────────────────────────

/** Returns full scorecard for a specific match */
const getScorecard = (matchId) => apiGet(`/mcenter/v1/${matchId}/scard`);

/** Returns match info / metadata */
const getMatchInfo = (matchId) => apiGet(`/mcenter/v1/${matchId}`);

/** Returns live commentary for a specific match */
const getLiveCommentary = (matchId) => apiGet(`/mcenter/v1/${matchId}/comm`);

// ─────────────────────────────────────────────────
//  RANKINGS  (fetched on a slow schedule)
// ─────────────────────────────────────────────────

/** @param {'test'|'odi'|'t20'} format */
const getBatsmenRankings = (format) =>
  apiGet(`/stats/v1/rankings/batsmen?formatType=${format}`);

/** @param {'test'|'odi'|'t20'} format */
const getBowlerRankings = (format) =>
  apiGet(`/stats/v1/rankings/bowlers?formatType=${format}`);

/** @param {'test'|'odi'|'t20'} format */
const getAllRounderRankings = (format) =>
  apiGet(`/stats/v1/rankings/allrounders?formatType=${format}`);

// ─────────────────────────────────────────────────
//  SERIES
// ─────────────────────────────────────────────────

const getSeriesList = () => apiGet('/series/v1/international');

module.exports = {
  getLiveMatches,
  getUpcomingMatches,
  getRecentMatches,
  getScorecard,
  getMatchInfo,
  getLiveCommentary,
  getBatsmenRankings,
  getBowlerRankings,
  getAllRounderRankings,
  getSeriesList,
};
