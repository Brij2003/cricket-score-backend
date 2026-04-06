'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { enrichMatchListResponse } = require('../src/normalize/matchListEnvelope');

// ── Fixtures ──────────────────────────────────────────────────────────────

/** A live match item from the new API (teama is fielding, teamb is batting) */
const LIVE_ITEM = {
  match_id: 96338,
  title: 'Australia Women Under-19s vs England Women Under-19s',
  short_title: 'AUS-WU19 vs ENG-WU19',
  subtitle: 'Match 1',
  format: 4,
  format_str: 'List A',
  status: 3,
  status_str: 'Live',
  status_note: 'Australia Women Under-19s elected to bowl',
  game_state: 3,
  game_state_str: 'Play Ongoing',
  competition: {
    cid: 129957,
    title: "Women's Under-19 Tri-Series in Australia",
    abbr: "Women's U19 Tri-Series",
    match_format: 'mixed',
    season: '2026',
  },
  teama: {
    team_id: 127109,
    name: 'Australia Women Under-19s',
    short_name: 'AUS-WU19',
    logo_url: 'https://example.com/aus.png',
    scores_full: '',
    scores: '',
    overs: '',
  },
  teamb: {
    team_id: 127123,
    name: 'England Women Under-19s',
    short_name: 'ENG-WU19',
    logo_url: 'https://example.com/eng.png',
    scores_full: '*119/6 (30.1 ov)',
    scores: '119/6',
    overs: '30.1',
  },
  timestamp_start: 1775446200,
  timestamp_end: 1775511000,
  live: 'Australia Women Under-19s elected to bowl',
  result: '',
  latest_inning_number: 1,
};

/** A completed match item */
const COMPLETED_ITEM = {
  match_id: 87014,
  title: 'India vs Australia',
  short_title: 'IND vs AUS',
  subtitle: '1st Semi-Final',
  format: 1,
  format_str: 'ODI',
  status: 2,
  status_str: 'Completed',
  status_note: 'India won by 4 wickets',
  game_state: 0,
  game_state_str: 'Default',
  competition: {
    cid: 129438,
    title: 'ICC Champions Trophy',
    abbr: 'ICC Champions 2025',
    match_format: 'odi',
    season: '2025',
  },
  teama: {
    team_id: 25,
    name: 'India',
    short_name: 'IND',
    logo_url: 'https://example.com/ind.png',
    scores_full: '267/6 (48.1 ov)',
    scores: '267/6',
    overs: '48.1',
  },
  teamb: {
    team_id: 5,
    name: 'Australia',
    short_name: 'AUS',
    logo_url: 'https://example.com/aus.png',
    scores_full: '264/10 (49.3 ov)',
    scores: '264/10',
    overs: '49.3',
  },
  timestamp_start: 1741078800,
  timestamp_end: 1741150800,
  live: '',
  result: 'India won by 4 wickets',
  latest_inning_number: 2,
};

// ── Tests ─────────────────────────────────────────────────────────────────

test('enrichMatchListResponse adds schemaVersion and source', () => {
  const raw = { response: { items: [LIVE_ITEM] } };
  const out = enrichMatchListResponse(raw);
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.source, 'cricket-live-line');
  assert.deepEqual(out.typeMatches, []);
});

test('live match: phase=live, badge=LIVE, hero populated', () => {
  const raw = { response: { items: [LIVE_ITEM] } };
  const out = enrichMatchListResponse(raw);
  assert.equal(out.pulseMatches.length, 1);
  const m = out.pulseMatches[0];
  assert.equal(m.matchId, '96338');
  assert.equal(m.phase, 'live');
  assert.equal(m.badge, 'LIVE');
  assert.ok(m.hero, 'hero should be populated for live match with scores');
  // teama has no scores, teamb has 119/6 — maps to hero.team1/team2 (not teama/teamb)
  assert.equal(m.hero.team2.runs, 119);
  assert.equal(m.hero.team2.wickets, 6);
  assert.equal(m.hero.team2.oversLabel, '30.1 Overs');
});

test('completed match: phase=completed, badge=RESULT, hero null', () => {
  const raw = { response: { items: [COMPLETED_ITEM] } };
  const out = enrichMatchListResponse(raw);
  const m = out.pulseMatches[0];
  assert.equal(m.matchId, '87014');
  assert.equal(m.phase, 'completed');
  assert.equal(m.badge, 'RESULT');
  assert.equal(m.hero, null);
  assert.equal(m.statusLine, 'India won by 4 wickets');
});

test('teamCodes are uppercase short names', () => {
  const raw = { response: { items: [COMPLETED_ITEM] } };
  const out = enrichMatchListResponse(raw);
  const m = out.pulseMatches[0];
  assert.deepEqual(m.teamCodes, ['IND', 'AUS']);
});

test('scheduledStartMs converts unix seconds to ms', () => {
  const raw = { response: { items: [COMPLETED_ITEM] } };
  const out = enrichMatchListResponse(raw);
  const m = out.pulseMatches[0];
  assert.equal(m.scheduledStartMs, 1741078800 * 1000);
});

test('seriesLine joins competition title, format, subtitle', () => {
  const raw = { response: { items: [COMPLETED_ITEM] } };
  const out = enrichMatchListResponse(raw);
  const m = out.pulseMatches[0];
  assert.equal(m.seriesLine, 'ICC Champions Trophy · ODI · 1st Semi-Final');
});

test('empty items array returns empty pulseMatches', () => {
  const raw = { response: { items: [] } };
  const out = enrichMatchListResponse(raw);
  assert.equal(out.pulseMatches.length, 0);
});

test('missing response returns empty pulseMatches', () => {
  const out = enrichMatchListResponse(null);
  assert.equal(out.pulseMatches.length, 0);
});
