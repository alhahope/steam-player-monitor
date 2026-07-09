export type SortKey = "rank" | "players" | "change" | "name";

export type Game = {
  appid: number;
  name: string;
  rank: number;
  currentPlayers: number | null;
  previousPlayers: number | null;
  change: number | null;
  capsuleUrl: string;
  storeUrl: string;
  error?: string;
};

export type HistoryData = {
  samples?: Array<{
    counts?: Record<string, number>;
  }>;
};

export type VisibleGameOptions = {
  query: string;
  sortKey: SortKey;
  favoritesOnly: boolean;
  favoriteIds: Set<number>;
};

export function deriveVisibleGames(
  games: Game[],
  options: VisibleGameOptions
): Game[] {
  const query = options.query.trim().toLowerCase();

  return games
    .filter((game) => {
      const matchesSearch =
        query.length === 0 ||
        game.name.toLowerCase().includes(query) ||
        String(game.appid).includes(query);
      const matchesFavorite =
        !options.favoritesOnly || options.favoriteIds.has(game.appid);
      return matchesSearch && matchesFavorite;
    })
    .sort((left, right) => compareGames(left, right, options.sortKey));
}

export function getTrendValues(history: HistoryData, appid: number): number[] {
  const key = String(appid);
  const samples = Array.isArray(history.samples) ? history.samples : [];

  return samples
    .map((sample) => sample.counts?.[key])
    .filter((value): value is number => Number.isFinite(value));
}

export function isDataStale(
  snapshot: { generatedAt?: string; status?: { lastSuccessfulAt?: string | null } },
  now = new Date(),
  thresholdMinutes = 30
): boolean {
  const timestamp = snapshot.status?.lastSuccessfulAt ?? snapshot.generatedAt;
  const generatedAt = timestamp ? new Date(timestamp) : null;

  if (!generatedAt || Number.isNaN(generatedAt.getTime())) {
    return true;
  }

  return now.getTime() - generatedAt.getTime() > thresholdMinutes * 60 * 1000;
}

function compareGames(left: Game, right: Game, sortKey: SortKey): number {
  if (sortKey === "name") {
    return left.name.localeCompare(right.name);
  }

  if (sortKey === "players") {
    return compareNullableNumberDescending(left.currentPlayers, right.currentPlayers);
  }

  if (sortKey === "change") {
    return compareNullableNumberDescending(left.change, right.change);
  }

  return left.rank - right.rank;
}

function compareNullableNumberDescending(left: number | null, right: number | null): number {
  const leftIsNumber = Number.isFinite(left);
  const rightIsNumber = Number.isFinite(right);

  if (leftIsNumber && rightIsNumber) {
    return Number(right) - Number(left);
  }

  if (leftIsNumber) {
    return -1;
  }

  if (rightIsNumber) {
    return 1;
  }

  return 0;
}
