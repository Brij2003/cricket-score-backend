/**
 * pulseMatchV1.js — CricBuzz match node → PulseMatchV1 wire contract (schema v1).
 * Field names must stay aligned with lib/models/contracts/pulse_match_v1.dart
 */

'use strict';

const SOON_MS = 3 * 60 * 60 * 1000;

function safeStr(v) {
  return v == null ? '' : String(v);
}

function parseStartMs(matchInfo) {
  const sd = matchInfo.startDate;
  if (sd == null) return null;
  if (typeof sd === 'number' && !Number.isNaN(sd)) return sd;
  const n = Number(sd);
  if (!Number.isNaN(n) && n > 1e12) return n;
  const t = Date.parse(String(sd));
  return Number.isNaN(t) ? null : t;
}

function isLiveMatch(matchInfo) {
  const status = safeStr(matchInfo.status).toLowerCase();
  const state = safeStr(matchInfo.state).toLowerCase();
  return status.includes('live') || state === 'in progress';
}

function isCompleted(matchInfo, statusText) {
  const s = safeStr(matchInfo.status).toLowerCase();
  const t = safeStr(statusText).toLowerCase();
  if (s === 'complete') return true;
  return ['won', 'tied', 'draw'].some((k) => t.includes(k));
}

function formatSeriesLine(matchInfo) {
  const series = safeStr(matchInfo.seriesName || matchInfo.series?.name);
  const fmt = safeStr(matchInfo.matchFormat || 'T20').toUpperCase();
  const desc = safeStr(matchInfo.matchDesc);
  const base = [series, fmt].filter(Boolean).join(' · ');
  return desc ? `${base} · ${desc}` : base;
}

function oversLabel(inn) {
  if (!inn || inn.overs == null) return '';
  return `${inn.overs} Overs`;
}

function inningFromScore(scoreSide) {
  if (!scoreSide) return null;
  const ing =
    scoreSide.inngs1 ||
    scoreSide.innings1 ||
    scoreSide.firstInning;
  if (!ing) return null;
  return {
    runs: Number(ing.runs) || 0,
    wickets: Number(ing.wickets) || 0,
    overs: ing.overs != null ? String(ing.overs) : null,
  };
}

/**
 * @param {object} matchWrapper — { matchInfo?, matchScore? } or flattened matchInfo
 * @param {number} nowMs
 * @returns {object} PulseMatchV1
 */
function matchWrapperToPulse(matchWrapper, nowMs) {
  const matchInfo = matchWrapper.matchInfo || matchWrapper;
  const matchScore = matchWrapper.matchScore || {};
  const team1 = matchInfo.team1 || {};
  const team2 = matchInfo.team2 || {};
  const t1Name = safeStr(team1.teamName);
  const t2Name = safeStr(team2.teamName);
  const t1Code = safeStr(team1.teamSName || team1.shortName);
  const t2Code = safeStr(team2.teamSName || team2.shortName);
  const headline = [t1Name, t2Name].every(Boolean) ? `${t1Name} vs ${t2Name}` : `${t1Code} vs ${t2Code}`;

  const statusText = safeStr(matchInfo.statusText || matchInfo.status);
  const live = isLiveMatch(matchInfo);
  const completed = !live && isCompleted(matchInfo, statusText);

  let phase = 'upcoming';
  if (live) phase = 'live';
  else if (completed) phase = 'completed';

  const startMs = parseStartMs(matchInfo);
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

  const t1Score = inningFromScore(matchScore.team1Score);
  const t2Score = inningFromScore(matchScore.team2Score);

  let subtitle = statusText;
  if (live && t1Score) {
    subtitle = `${t1Code} ${t1Score.runs}/${t1Score.wickets}${t1Score.overs ? ` · ${t1Score.overs} ov` : ''}`;
  } else if (!live && !completed && startMs) {
    subtitle = statusText || new Date(startMs).toISOString();
  }

  /** @type {object | null} */
  let hero = null;
  if (live && t1Score) {
    const r2 = t2Score || { runs: 0, wickets: 0, overs: null };
    hero = {
      team1: {
        shortCode: t1Code || '?',
        runs: t1Score.runs,
        wickets: t1Score.wickets,
        oversLabel: oversLabel({ overs: t1Score.overs }),
      },
      team2: {
        shortCode: t2Code || '?',
        runs: r2.runs,
        wickets: r2.wickets,
        oversLabel: oversLabel({ overs: r2.overs }),
      },
    };
  }

  return {
    matchId: safeStr(matchInfo.matchId),
    seriesLine: formatSeriesLine(matchInfo),
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
  matchWrapperToPulse,
  SOON_MS,
};
