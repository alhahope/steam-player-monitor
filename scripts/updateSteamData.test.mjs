import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSnapshot,
  mergeHistory,
  normalizeRank
} from "./updateSteamData.mjs";

test("normalizeRank converts Steam chart ranks into stable app entries", () => {
  const entry = normalizeRank(
    { rank: "2", appid: "570", last_week_rank: "4", peak_in_game: "700000" },
    { name: "Dota 2", capsuleUrl: "https://example.test/dota.jpg" }
  );

  assert.deepEqual(entry, {
    appid: 570,
    rank: 2,
    previousRank: 4,
    peakInGame: 700000,
    name: "Dota 2",
    capsuleUrl: "https://example.test/dota.jpg",
    storeUrl: "https://store.steampowered.com/app/570"
  });
});

test("mergeHistory appends numeric counts and trims old samples", () => {
  const history = mergeHistory(
    {
      updatedAt: "2026-07-09T00:00:00.000Z",
      samples: [
        {
          timestamp: "2026-07-09T00:00:00.000Z",
          counts: { "730": 10 },
          ranks: { "730": 1 }
        }
      ]
    },
    [
      { appid: 730, rank: 1, currentPlayers: 12 },
      { appid: 570, rank: 2, currentPlayers: null }
    ],
    "2026-07-09T00:10:00.000Z",
    1
  );

  assert.equal(history.updatedAt, "2026-07-09T00:10:00.000Z");
  assert.equal(history.samples.length, 1);
  assert.deepEqual(history.samples[0], {
    timestamp: "2026-07-09T00:10:00.000Z",
    counts: { "730": 12 },
    ranks: { "730": 1 }
  });
});

test("buildSnapshot calculates previous player delta", () => {
  const snapshot = buildSnapshot(
    [{ rank: 1, appid: 730, last_week_rank: 1, peak_in_game: 1200000 }],
    {
      "730": {
        name: "Counter-Strike 2",
        capsuleUrl: "https://example.test/cs2.jpg"
      }
    },
    { "730": 42 },
    {
      games: [
        {
          appid: 730,
          currentPlayers: 40
        }
      ]
    },
    "2026-07-09T00:10:00.000Z"
  );

  assert.equal(snapshot.games.length, 1);
  assert.equal(snapshot.games[0].currentPlayers, 42);
  assert.equal(snapshot.games[0].previousPlayers, 40);
  assert.equal(snapshot.games[0].change, 2);
});

test("buildSnapshot preserves previous player count when a count request fails", () => {
  const snapshot = buildSnapshot(
    [{ rank: 1, appid: 730, last_week_rank: 1, peak_in_game: 1200000 }],
    { "730": { name: "Counter-Strike 2" } },
    {},
    {
      games: [
        {
          appid: 730,
          currentPlayers: 40
        }
      ]
    },
    "2026-07-09T00:10:00.000Z"
  );

  assert.equal(snapshot.status.ok, false);
  assert.equal(snapshot.games[0].currentPlayers, 40);
  assert.equal(snapshot.games[0].previousPlayers, 40);
  assert.equal(snapshot.games[0].change, 0);
  assert.match(snapshot.games[0].error, /player count/i);
});
