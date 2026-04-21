'use strict';

/**
 * snapshot.js
 * ───────────
 * Reads all API endpoints from the provider CSV, calls each one once,
 * and writes a flat JSON snapshot of every request + response.
 *
 * Usage:
 *   npm run snapshot
 *   node scripts/snapshot.js
 *
 * Output is saved to cricket_backend/snapshots/ — use it as the source
 * of truth for writing contracts and data transformers when switching providers.
 *
 * ── Switching providers ──────────────────────────────────────────────────────
 * 1. Update CONFIG.csvPath  to point to the new provider's CSV
 * 2. Update CONFIG.host     to the new RapidAPI host
 * 3. Update CONFIG.overrides with sample IDs from the new CSV's curl examples
 * 4. Run:  npm run snapshot
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIG
//  ↓ Only edit this block when switching providers or refreshing IDs
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  csvPath: path.resolve(
    __dirname,
    '../../cricket-score-app/Cricket Live Line Advance - API Reference - Sheet1.csv'
  ),
  outputDir: path.resolve(__dirname, '../snapshots'),

  // RapidAPI host for this provider
  host: 'cricket-live-line-advance.p.rapidapi.com',

  // Seed IDs — taken directly from the curl examples in the CSV.
  // These guarantee real responses on the first run.
  // Set any to null to re-enable auto-discovery from live responses.
  overrides: {
    match_id:       '87014',              // from curl examples
    innings_id:     '2',                  // from curl examples (Match Commentary)
    competition_id: '129438',             // from curl examples
    player_id:      '119',               // Virat Kohli (from curl examples)
    player_name:    'Virat%20Kohli',     // URL-encoded for query param
    team_id:        '25',               // India (from curl examples)
    team_name:      'india',            // for Team List search
    venue_id:       '17',              // from curl examples
    stat_type:      'batting_most_runs', // from curl examples
    year:           '2025',             // from curl examples
    id:             null,               // auto-set to competition_id (Media endpoint)
  },
};

// ─────────────────────────────────────────────────────────────────────────────

function getHeaders() {
  return {
    'x-rapidapi-key':  process.env.RAPIDAPI_KEY,
    'x-rapidapi-host': CONFIG.host,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CSV PARSING
//  Handles: #, Category, Endpoint Name, Method, Full URL, cURL Command
// ─────────────────────────────────────────────────────────────────────────────

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split('\n').map(l => l.trim()).filter(Boolean);
  const result  = [];

  for (let i = 1; i < lines.length; i++) {   // i=0 is header
    const parts    = lines[i].split(',');
    // Columns: 0=#, 1=Category, 2=Endpoint Name, 3=Method, 4=Full URL, 5+=cURL
    const number   = (parts[0] || '').trim();
    const category = (parts[1] || '').trim();
    const name     = (parts[2] || '').trim();
    const method   = (parts[3] || 'GET').trim();

    // Full URL may contain commas inside query strings — rejoin from col 4 onward
    // but stop before the cURL column (which starts with "curl ")
    const rest = parts.slice(4).join(',');
    const curlIdx = rest.indexOf(',curl ');
    const fullUrl = (curlIdx !== -1 ? rest.slice(0, curlIdx) : rest).trim();

    if (!name || !fullUrl) continue;

    result.push({ number, category, name, method, templateUrl: fullUrl });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ID EXTRACTION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Safe deep-get — never throws on missing keys */
function deepGet(obj, keyPath) {
  return keyPath.reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
}

/** Try multiple key-paths, return first non-null as a string */
function tryPaths(obj, ...paths) {
  for (const p of paths) {
    const val = deepGet(obj, p);
    if (val != null) return String(val);
  }
  return null;
}

/** Extract match_id from Matches List response */
function extractMatchId(data) {
  return tryPaths(data,
    ['data', 0, 'match_id'],
    ['data', 0, 'id'],
    ['matches', 0, 'match_id'],
    ['matches', 0, 'id'],
    ['results', 0, 'match_id'],
  );
}

/** Extract competition_id from Competitions List response */
function extractCompetitionId(data) {
  return tryPaths(data,
    ['data', 0, 'competition_id'],
    ['data', 0, 'id'],
    ['competitions', 0, 'competition_id'],
    ['competitions', 0, 'id'],
    ['results', 0, 'id'],
  );
}

/** Extract player_id from Player List & Search response */
function extractPlayerId(data) {
  return tryPaths(data,
    ['data', 0, 'player_id'],
    ['data', 0, 'id'],
    ['players', 0, 'id'],
    ['results', 0, 'id'],
  );
}

/** Extract team_id from Team List response */
function extractTeamId(data) {
  return tryPaths(data,
    ['data', 0, 'team_id'],
    ['data', 0, 'id'],
    ['teams', 0, 'id'],
    ['results', 0, 'id'],
  );
}

/** Extract venue_id from Match Info response */
function extractVenueId(data) {
  return tryPaths(data,
    ['data', 'venue', 'venue_id'],
    ['data', 'venue', 'id'],
    ['data', 'venue_id'],
    ['venue', 'id'],
  );
}

/** Extract stat_type from Competition Stats Type response */
function extractStatType(data) {
  return tryPaths(data,
    ['data', 0, 'type'],
    ['data', 0, 'key'],
    ['stats', 0, 'type'],
    ['types', 0, 'key'],
  );
}

// Maps endpoint names → extractor that runs after a successful call
const ID_EXTRACTORS = {
  'Matches List': (data, ids) => {
    if (!ids.match_id) ids.match_id = extractMatchId(data);
  },
  'Competitions List': (data, ids) => {
    if (!ids.competition_id) {
      ids.competition_id = extractCompetitionId(data);
      // id param (Media endpoint) mirrors competition_id
      if (ids.competition_id && !ids.id) ids.id = ids.competition_id;
    }
  },
  'Player List & Search': (data, ids) => {
    if (!ids.player_id) ids.player_id = extractPlayerId(data);
  },
  'Team List': (data, ids) => {
    if (!ids.team_id) ids.team_id = extractTeamId(data);
  },
  'Match Info': (data, ids) => {
    if (!ids.venue_id) ids.venue_id = extractVenueId(data);
  },
  'Competition Stats Type': (data, ids) => {
    if (!ids.stat_type) ids.stat_type = extractStatType(data);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP CALL
// ─────────────────────────────────────────────────────────────────────────────

async function callEndpoint(endpoint, ids) {
  const { name, templateUrl, method } = endpoint;

  // Find all {param} tokens in the URL
  const paramTokens = (templateUrl.match(/\{(\w+)\}/g) || []).map(t => t.slice(1, -1));
  const missingIds  = paramTokens.filter(p => ids[p] == null);

  if (missingIds.length > 0) {
    return {
      number:      endpoint.number,
      category:    endpoint.category,
      name,
      templateUrl,
      resolvedUrl: null,
      status:      'skipped',
      reason:      `Missing: ${missingIds.join(', ')} — not in overrides and not auto-discovered`,
    };
  }

  // Substitute all {param} → value
  let resolvedUrl = templateUrl;
  for (const param of paramTokens) {
    resolvedUrl = resolvedUrl.replace(`{${param}}`, ids[param]);
  }

  const headers = getHeaders();
  const start   = Date.now();

  try {
    const response = await axios.get(resolvedUrl, { headers, timeout: 15000 });
    return {
      number:      endpoint.number,
      category:    endpoint.category,
      name,
      templateUrl,
      resolvedUrl,
      status:      'success',
      httpStatus:  response.status,
      request:     { method, headers: { 'x-rapidapi-host': CONFIG.host } },
      response:    response.data,
      durationMs:  Date.now() - start,
    };
  } catch (err) {
    const entry = {
      number:      endpoint.number,
      category:    endpoint.category,
      name,
      templateUrl,
      resolvedUrl,
      status:      'error',
      durationMs:  Date.now() - start,
    };
    if (err.response) {
      entry.httpStatus = err.response.status;
      entry.error      = `API error [${err.response.status}]: ${JSON.stringify(err.response.data)}`;
    } else {
      entry.error = err.message;
    }
    return entry;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.RAPIDAPI_KEY) {
    console.error('\nERROR: RAPIDAPI_KEY not set.');
    console.error('Add it to cricket_backend/.env — see .env.example\n');
    process.exit(1);
  }

  const endpoints = parseCsv(CONFIG.csvPath);
  console.log(`\nProvider : ${CONFIG.host}`);
  console.log(`Endpoints: ${endpoints.length} loaded from CSV`);

  // Build IDs — seed from overrides, auto-discovery fills in the rest
  const ids = {};
  for (const [key, val] of Object.entries(CONFIG.overrides)) {
    if (val != null) ids[key] = val;
  }
  // id mirrors competition_id unless explicitly overridden
  if (!ids.id && ids.competition_id) ids.id = ids.competition_id;

  const results       = [];
  let successCount    = 0;
  let errorCount      = 0;
  let skippedCount    = 0;

  console.log('\n  #   Category          Endpoint Name                    Status');
  console.log('  ' + '─'.repeat(72));

  for (const endpoint of endpoints) {
    const label = `${endpoint.number.padStart(2)}  ${endpoint.category.padEnd(18)}${endpoint.name.padEnd(33)}`;
    process.stdout.write(`  ${label}`);

    const result = await callEndpoint(endpoint, ids);
    results.push(result);

    // Run extractor if one is registered for this endpoint
    if (result.status === 'success' && ID_EXTRACTORS[endpoint.name]) {
      ID_EXTRACTORS[endpoint.name](result.response, ids);
    }

    if (result.status === 'success') {
      console.log(`✓  ${result.httpStatus}  (${result.durationMs}ms)`);
      successCount++;
    } else if (result.status === 'skipped') {
      console.log(`–  skipped`);
      skippedCount++;
    } else {
      const snippet = (result.error || '').slice(0, 48);
      console.log(`✗  ${result.httpStatus || 'ERR'}  ${snippet}`);
      errorCount++;
    }

    // 1200ms between calls — stays within ~30 req/min burst limit
    await new Promise(r => setTimeout(r, 1200));
  }

  // Write snapshot file
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath   = path.join(CONFIG.outputDir, `snapshot-${timestamp}.json`);

  fs.writeFileSync(outPath, JSON.stringify({
    capturedAt:    new Date().toISOString(),
    provider:      CONFIG.host,
    discoveredIds: { ...ids },
    endpoints:     results,
  }, null, 2));

  // Summary
  console.log('\n  ' + '─'.repeat(72));
  console.log(`  Total    ${String(endpoints.length).padStart(3)}`);
  console.log(`  Success  ${String(successCount).padStart(3)}`);
  console.log(`  Error    ${String(errorCount).padStart(3)}`);
  console.log(`  Skipped  ${String(skippedCount).padStart(3)}`);
  console.log(`\n  Output → ${outPath}\n`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
