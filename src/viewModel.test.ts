import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveVisibleGames,
  getTrendValues,
  isDataStale
} from "./viewModel.ts";

const games = [
  {
    appid: 730,
    name: "Counter-Strike 2",
    rank: 1,
    currentPlayers: 100,
    previousPlayers: 90,
    change: 10,
    capsuleUrl: "",
    storeUrl: ""
  },
  {
    appid: 570,
    name: "Dota 2",
    rank: 2,
    currentPlayers: 200,
    previousPlayers: 220,
    change: -20,
    capsuleUrl: "",
    storeUrl: ""
  }
];

test("deriveVisibleGames filters by search and favorites", () => {
  const visible = deriveVisibleGames(games, {
    query: "counter",
    sortKey: "rank",
    favoritesOnly: true,
    favoriteIds: new Set([730])
  });

  assert.equal(visible.length, 1);
  assert.equal(visible[0].appid, 730);
});

test("deriveVisibleGames sorts player counts descending with unavailable values last", () => {
  const visible = deriveVisibleGames(
    [
      ...games,
      {
        appid: 1422450,
        name: "Deadlock",
        rank: 3,
        currentPlayers: null,
        previousPlayers: null,
        change: null,
        capsuleUrl: "",
        storeUrl: ""
      }
    ],
    {
      query: "",
      sortKey: "players",
      favoritesOnly: false,
      favoriteIds: new Set()
    }
  );

  assert.deepEqual(
    visible.map((game) => game.appid),
    [570, 730, 1422450]
  );
});

test("getTrendValues returns only numeric samples for one app", () => {
  const trend = getTrendValues(
    {
      samples: [
        { counts: { "730": 10 } },
        { counts: { "570": 20 } },
        { counts: { "730": 30 } }
      ]
    },
    730
  );

  assert.deepEqual(trend, [10, 30]);
});

test("isDataStale flags snapshots older than the threshold", () => {
  assert.equal(
    isDataStale(
      { generatedAt: "2026-07-09T00:00:00.000Z" },
      new Date("2026-07-09T00:31:00.000Z"),
      30
    ),
    true
  );
});
