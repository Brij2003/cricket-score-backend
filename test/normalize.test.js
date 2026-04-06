'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { enrichMatchListResponse } = require('../src/normalize/matchListEnvelope');

test('enrichMatchListResponse adds schemaVersion and pulseMatches', () => {
  const raw = {
    typeMatches: [
      {
        seriesMatches: [
          {
            seriesAdWrapper: {
              matches: [
                {
                  matchInfo: {
                    matchId: '99',
                    seriesName: 'Test Series',
                    matchDesc: '1st T20',
                    matchFormat: 'T20',
                    status: 'Live',
                    statusText: 'In progress',
                    team1: { teamName: 'India', teamSName: 'IND' },
                    team2: { teamName: 'Australia', teamSName: 'AUS' },
                  },
                  matchScore: {
                    team1Score: {
                      inngs1: { runs: 10, wickets: 1, overs: '2.0' },
                    },
                    team2Score: {
                      inngs1: { runs: 5, wickets: 0, overs: '1.0' },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const out = enrichMatchListResponse(raw);
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.pulseMatches.length, 1);
  assert.equal(out.pulseMatches[0].matchId, '99');
  assert.equal(out.pulseMatches[0].phase, 'live');
  assert.equal(out.pulseMatches[0].badge, 'LIVE');
  assert.ok(out.pulseMatches[0].hero);
});
