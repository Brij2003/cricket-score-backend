/**
 * pulseMatchV1.js — Cricket Live Line match item → PulseMatchV1 wire contract (schema v1).
 * Field names must stay aligned with lib/models/contracts/pulse_match_v1.dart
 *
 * Input: flat match item from cricket-live-line-advance API
 *   item.status: 1=upcoming, 2=completed, 3=live
 *   item.teama / item.teamb: team objects with scores, overs
 *   item.timestamp_start: Unix seconds
 */

'use strict';

const SOON_MS = 3 * 60 * 60 * 1000;

function safeStr(v) {
  return v == null ? '' : String(v);
}

/**
 * Parse "runs/wickets" score string into { runs, wickets }.
 * Returns null when scores string is empty.
 */
function parseScores(teamSide) {
  const s = safeStr(teamSide?.scores);
  if (!s) return null;
  const slash = s.indexOf('/');
  if (slash === -1) return null;
  const runs = parseInt(s.slice(0, slash), 10);
  const wickets = parseInt(s.slice(slash + 1), 10);
  if (Number.isNaN(runs)) return null;
  return {
    runs,
    wickets: Number.isNaN(wickets) ? 0 : wickets,
    overs: safeStr(teamSide?.overs) || null,
  };
}

function oversLabel(overs) {
  if (!overs) return '';
  return `${overs} Overs`;
}

function formatSeriesLine(item) {
  const title = safeStr(item.competition?.title);
  const fmt = safeStr(item.format_str).toUpperCase();
  const sub = safeStr(item.subtitle);
  return [title, fmt, sub].filter(Boolean).join(' · ');
}

/**
 * @param {object} item — flat match item from Cricket Live Line API
 * @param {number} nowMs
 * @returns {object} PulseMatchV1
 */
function matchItemToPulse(item, nowMs) {
  if (!item) return null;
  const teama = item.teama || {};
  const teamb = item.teamb || {};

  const t1Name = safeStr(teama.name);
  const t2Name = safeStr(teamb.name);
  const t1Code = safeStr(teama.short_name);
  const t2Code = safeStr(teamb.short_name);
  const headline = [t1Name, t2Name].every(Boolean)
    ? `${t1Name} vs ${t2Name}`
    : `${t1Code} vs ${t2Code}`;

  // status: 3=live, 2=completed, 1=upcoming
  const status = item.status;
  const live = status === 3;
  const completed = status === 2;

  let phase = 'upcoming';
  if (live) phase = 'live';
  else if (completed) phase = 'completed';

  const startMs =
    item.timestamp_start != null
      ? Math.trunc(Number(item.timestamp_start) * 1000)
      : null;

  let badge = 'UPCOMING';
  let subtitleEmphasis = 'none';

  if (live) {
    badge = 'LIVE';
  } else if (completed) {
    badge = 'RESULT';
    subtitleEmphasis = 'result';
  } else {
    if (startMs && startMs > nowMs && startMs - nowMs <= SOON_MS) {
      badge = 'STARTING_SOON';
      subtitleEmphasis = 'soon';
    } else {
      badge = 'UPCOMING';
    }
  }

  const statusText = safeStr(item.status_note || item.live);

  const t1Score = parseScores(teama);
  const t2Score = parseScores(teamb);

  // subtitle: live → show batting team score; upcoming → show start time; completed → status note
  let subtitle = statusText;
  if (live && (t1Score || t2Score)) {
    const battingScore = t2Score || t1Score; // teamb usually bats when teama fielded
    const battingCode = t2Score ? t2Code : t1Code;
    subtitle = `${battingCode} ${battingScore.runs}/${battingScore.wickets}${battingScore.overs ? ` · ${battingScore.overs} ov` : ''}`;
  } else if (!live && !completed && startMs) {
    subtitle = statusText || new Date(startMs).toISOString();
  }

  // hero: only populated when live and at least one team has scores
  let hero = null;
  if (live && (t1Score || t2Score)) {
    const r1 = t1Score || { runs: 0, wickets: 0, overs: null };
    const r2 = t2Score || { runs: 0, wickets: 0, overs: null };
    hero = {
      team1: {
        shortCode: t1Code || '?',
        runs: r1.runs,
        wickets: r1.wickets,
        oversLabel: oversLabel(r1.overs),
      },
      team2: {
        shortCode: t2Code || '?',
        runs: r2.runs,
        wickets: r2.wickets,
        oversLabel: oversLabel(r2.overs),
      },
    };
  }

  return {
    matchId: safeStr(item.match_id),
    seriesLine: formatSeriesLine(item),
    headline,
    phase,
    badge,
    subtitle,
    subtitleEmphasis,
    teamCodes: [t1Code, t2Code].map((c) => c.toUpperCase()),
    statusLine: statusText,
    scheduledStartMs: startMs,
    hero,
  };
}

module.exports = {
  matchItemToPulse,
};
