import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CHART_URL =
  "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/?format=json";
export const PLAYER_URL =
  "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/";
export const APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
export const TRACKED_GAME_COUNT = 50;
export const HISTORY_LIMIT = 144;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const dataDir = path.join(projectRoot, "public", "data");
const currentFile = path.join(dataDir, "current.json");
const historyFile = path.join(dataDir, "history.json");
const cacheFile = path.join(dataDir, "app-cache.json");

const fallbackCapsule = (appid) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

const toNumberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const indexPreviousGames = (previousCurrent) => {
  const games = Array.isArray(previousCurrent?.games) ? previousCurrent.games : [];
  return new Map(games.map((game) => [String(game.appid), game]));
};

export function normalizeRank(rawRank, metadata = {}) {
  const appid = toNumberOrNull(rawRank?.appid);

  if (!appid) {
    throw new Error(`Invalid Steam appid in chart entry: ${JSON.stringify(rawRank)}`);
  }

  return {
    appid,
    rank: toNumberOrNull(rawRank.rank) ?? 0,
    previousRank: toNumberOrNull(rawRank.last_week_rank),
    peakInGame: toNumberOrNull(rawRank.peak_in_game),
    name: metadata.name ?? `Steam App ${appid}`,
    capsuleUrl: metadata.capsuleUrl ?? fallbackCapsule(appid),
    storeUrl: `https://store.steampowered.com/app/${appid}`
  };
}

export function mergeHistory(previousHistory, games, generatedAt, limit = HISTORY_LIMIT) {
  const counts = {};
  const ranks = {};

  for (const game of games) {
    if (Number.isFinite(game.currentPlayers)) {
      counts[String(game.appid)] = game.currentPlayers;
      ranks[String(game.appid)] = game.rank;
    }
  }

  const previousSamples = Array.isArray(previousHistory?.samples)
    ? previousHistory.samples
    : [];
  const samples = [...previousSamples, { timestamp: generatedAt, counts, ranks }].slice(
    -limit
  );

  return {
    updatedAt: generatedAt,
    samples
  };
}

export function buildSnapshot(
  chartRanks,
  appCache,
  playerCounts,
  previousCurrent,
  generatedAt
) {
  const previousGames = indexPreviousGames(previousCurrent);
  let missingPlayerCounts = 0;

  const games = chartRanks
    .map((rank) => {
      const appid = String(rank.appid);
      const previousGame = previousGames.get(appid);
      const metadata = appCache[appid] ?? previousGame ?? {};
      const normalized = normalizeRank(rank, metadata);
      const fetchedCount = playerCounts[appid];
      const hasFetchedCount = Number.isFinite(fetchedCount);
      const previousPlayers = Number.isFinite(previousGame?.currentPlayers)
        ? previousGame.currentPlayers
        : null;
      const currentPlayers = hasFetchedCount ? fetchedCount : previousPlayers;
      const change =
        Number.isFinite(currentPlayers) && Number.isFinite(previousPlayers)
          ? currentPlayers - previousPlayers
          : null;

      if (!hasFetchedCount) {
        missingPlayerCounts += 1;
      }

      return {
        ...normalized,
        currentPlayers,
        previousPlayers,
        change,
        error: hasFetchedCount
          ? undefined
          : "Player count unavailable; using previous value when possible."
      };
    })
    .sort((left, right) => left.rank - right.rank);

  return {
    generatedAt,
    checkedAt: generatedAt,
    source: "steam",
    status: {
      ok: missingPlayerCounts === 0,
      message:
        missingPlayerCounts === 0
          ? `Updated ${games.length} Steam games.`
          : `Updated ${games.length} Steam games with ${missingPlayerCounts} player count fallback(s).`
    },
    games
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempFile, file);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, { retries = 2, timeoutMs = 15000 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "steam-player-monitor/0.1 (+https://github.com)"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
}

async function fetchChartRanks() {
  const json = await fetchJson(CHART_URL);
  const ranks = json?.response?.ranks;

  if (!Array.isArray(ranks)) {
    throw new Error("Steam chart response did not include response.ranks.");
  }

  return ranks.slice(0, TRACKED_GAME_COUNT);
}

async function fetchAppDetails(appid) {
  const url = `${APP_DETAILS_URL}?appids=${appid}&filters=basic&cc=us&l=en`;
  const json = await fetchJson(url);
  const data = json?.[String(appid)]?.data;

  if (!json?.[String(appid)]?.success || !data?.name) {
    throw new Error(`Steam appdetails did not include a name for ${appid}.`);
  }

  return {
    name: data.name,
    capsuleUrl: data.header_image ?? fallbackCapsule(appid),
    lastSeenAt: new Date().toISOString()
  };
}

async function fetchPlayerCount(appid) {
  const url = `${PLAYER_URL}?appid=${appid}&format=json`;
  const json = await fetchJson(url);
  const count = toNumberOrNull(json?.response?.player_count);

  if (!Number.isFinite(count)) {
    throw new Error(`Steam player count missing for ${appid}.`);
  }

  return count;
}

async function updateAppCache(ranks, existingCache, previousCurrent) {
  const previousGames = indexPreviousGames(previousCurrent);
  const nextCache = { ...existingCache };
  const missing = ranks
    .map((rank) => String(rank.appid))
    .filter((appid) => !nextCache[appid]?.name);

  const fetched = await mapLimit(missing, 4, async (appid) => {
    try {
      return [appid, await fetchAppDetails(appid)];
    } catch {
      const previousGame = previousGames.get(appid);
      return [
        appid,
        {
          name: previousGame?.name ?? `Steam App ${appid}`,
          capsuleUrl: previousGame?.capsuleUrl ?? fallbackCapsule(appid),
          lastSeenAt: new Date().toISOString()
        }
      ];
    }
  });

  for (const [appid, details] of fetched) {
    nextCache[appid] = details;
  }

  return nextCache;
}

async function fetchPlayerCounts(ranks) {
  const entries = await mapLimit(ranks, 8, async (rank) => {
    const appid = String(rank.appid);

    try {
      return [appid, await fetchPlayerCount(appid)];
    } catch {
      return [appid, null];
    }
  });

  return Object.fromEntries(
    entries.filter(([, playerCount]) => Number.isFinite(playerCount))
  );
}

function chartFailureSnapshot(previousCurrent, generatedAt, error) {
  return {
    generatedAt: previousCurrent?.generatedAt ?? generatedAt,
    checkedAt: generatedAt,
    source: "steam",
    status: {
      ok: false,
      message: `Steam chart update failed: ${error.message}`,
      lastSuccessfulAt: previousCurrent?.generatedAt ?? null
    },
    games: Array.isArray(previousCurrent?.games) ? previousCurrent.games : []
  };
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const previousCurrent = await readJson(currentFile, {
    generatedAt,
    status: { ok: false },
    games: []
  });
  const previousHistory = await readJson(historyFile, {
    updatedAt: generatedAt,
    samples: []
  });
  const appCache = await readJson(cacheFile, {});

  let chartRanks;

  try {
    chartRanks = await fetchChartRanks();
  } catch (error) {
    await writeJsonAtomic(
      currentFile,
      chartFailureSnapshot(previousCurrent, generatedAt, error)
    );
    return;
  }

  const nextCache = await updateAppCache(chartRanks, appCache, previousCurrent);
  const playerCounts = await fetchPlayerCounts(chartRanks);
  const current = buildSnapshot(
    chartRanks,
    nextCache,
    playerCounts,
    previousCurrent,
    generatedAt
  );
  const history = mergeHistory(previousHistory, current.games, generatedAt);

  await writeJsonAtomic(cacheFile, nextCache);
  await writeJsonAtomic(currentFile, current);
  await writeJsonAtomic(historyFile, history);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
