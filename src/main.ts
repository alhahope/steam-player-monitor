import "./styles.css";
import {
  deriveVisibleGames,
  getTrendValues,
  isDataStale,
  type Game,
  type HistoryData,
  type SortKey
} from "./viewModel";

type CurrentData = {
  generatedAt: string;
  checkedAt?: string;
  source: string;
  status: {
    ok: boolean;
    message: string;
    lastSuccessfulAt?: string | null;
  };
  games: Game[];
};

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const state: {
  current: CurrentData | null;
  history: HistoryData;
  query: string;
  sortKey: SortKey;
  favoritesOnly: boolean;
  favoriteIds: Set<number>;
  loadError: string | null;
} = {
  current: null,
  history: { samples: [] },
  query: "",
  sortKey: "rank",
  favoritesOnly: false,
  favoriteIds: readFavorites(),
  loadError: null
};

const appElement = document.querySelector<HTMLDivElement>("#app");

if (!appElement) {
  throw new Error("Missing #app element.");
}

const app: HTMLDivElement = appElement;

init();

async function init(): Promise<void> {
  renderShell();

  try {
    const [current, history] = await Promise.all([
      fetchJson<CurrentData>("./data/current.json"),
      fetchJson<HistoryData>("./data/history.json")
    ]);

    state.current = current;
    state.history = history;
    state.loadError = null;
  } catch (error) {
    state.loadError =
      error instanceof Error ? error.message : "Failed to load dashboard data.";
  }

  renderShell();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function renderShell(): void {
  const activeId = document.activeElement?.id;

  if (state.loadError) {
    app.innerHTML = renderError(state.loadError);
    return;
  }

  if (!state.current) {
    app.innerHTML = renderLoading();
    return;
  }

  const games = state.current.games;
  const visibleGames = deriveVisibleGames(games, {
    query: state.query,
    sortKey: state.sortKey,
    favoritesOnly: state.favoritesOnly,
    favoriteIds: state.favoriteIds
  });
  const totalPlayers = games.reduce(
    (total, game) =>
      Number.isFinite(game.currentPlayers) ? total + Number(game.currentPlayers) : total,
    0
  );
  const unavailable = games.filter((game) => !Number.isFinite(game.currentPlayers)).length;
  const stale = isDataStale(state.current);
  const leader = [...games].sort((left, right) => left.rank - right.rank)[0];

  app.innerHTML = `
    <main class="dashboard">
      <header class="topbar">
        <div>
          <p class="eyebrow">Steam concurrent players</p>
          <h1>Top 50 live monitor</h1>
        </div>
        <div class="status-pill ${state.current.status.ok && !stale ? "is-ok" : "is-warn"}">
          <span class="status-dot"></span>
          ${escapeHtml(statusLabel(stale, unavailable))}
        </div>
      </header>

      <section class="metrics" aria-label="Snapshot metrics">
        ${renderMetric("Tracked", numberFormatter.format(games.length), "Steam apps")}
        ${renderMetric("Current players", numberFormatter.format(totalPlayers), "Visible snapshot")}
        ${renderMetric("Leader", leader ? escapeHtml(leader.name) : "Waiting", leader ? `#${leader.rank}` : "No data")}
        ${renderMetric("Updated", formatDate(state.current.generatedAt), state.current.source)}
      </section>

      <section class="toolbar" aria-label="Dashboard controls">
        <label class="search">
          <span>Search</span>
          <input id="search" type="search" value="${escapeHtml(state.query)}" placeholder="Game or AppID" />
        </label>
        <label class="select">
          <span>Sort</span>
          <select id="sort">
            ${renderSortOption("rank", "Rank")}
            ${renderSortOption("players", "Players")}
            ${renderSortOption("change", "Change")}
            ${renderSortOption("name", "Name")}
          </select>
        </label>
        <button id="favoritesOnly" class="icon-toggle ${state.favoritesOnly ? "is-active" : ""}" type="button" title="Show favorites" aria-pressed="${state.favoritesOnly}">
          ${starIcon(state.favoritesOnly)}
          <span>Favorites</span>
        </button>
      </section>

      <section class="notice ${state.current.status.ok && !stale ? "is-hidden" : ""}" aria-live="polite">
        ${escapeHtml(noticeText(stale, state.current.status.message))}
      </section>

      <section class="game-list" aria-label="Steam games">
        ${visibleGames.map(renderGame).join("")}
      </section>
    </main>
  `;

  bindEvents();
  restoreFocus(activeId);
}

function renderLoading(): string {
  return `
    <main class="dashboard dashboard-center">
      <div class="loader"></div>
      <p>Loading Steam data...</p>
    </main>
  `;
}

function renderError(message: string): string {
  return `
    <main class="dashboard dashboard-center">
      <h1>Steam Player Monitor</h1>
      <p class="error-text">${escapeHtml(message)}</p>
    </main>
  `;
}

function renderMetric(label: string, value: string, detail: string): string {
  return `
    <article class="metric">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `;
}

function renderSortOption(value: SortKey, label: string): string {
  return `<option value="${value}" ${state.sortKey === value ? "selected" : ""}>${label}</option>`;
}

function renderGame(game: Game): string {
  const isFavorite = state.favoriteIds.has(game.appid);
  const trend = getTrendValues(state.history, game.appid);
  const changeClass =
    game.change === null ? "is-muted" : game.change > 0 ? "is-up" : game.change < 0 ? "is-down" : "is-flat";

  return `
    <article class="game-row" data-appid="${game.appid}">
      <div class="rank">#${game.rank}</div>
      <img class="capsule" src="${escapeAttribute(game.capsuleUrl)}" alt="" loading="lazy" />
      <div class="game-main">
        <div class="game-title">
          <h2>${escapeHtml(game.name)}</h2>
          <span>${game.appid}</span>
        </div>
        <div class="sparkline" aria-hidden="true">${renderSparkline(trend)}</div>
      </div>
      <div class="players">
        <strong>${formatPlayers(game.currentPlayers)}</strong>
        <span class="${changeClass}">${formatChange(game.change)}</span>
      </div>
      <div class="actions">
        <button class="favorite" type="button" data-favorite="${game.appid}" title="Toggle favorite" aria-pressed="${isFavorite}">
          ${starIcon(isFavorite)}
        </button>
        <a class="store-link" href="${escapeAttribute(game.storeUrl)}" target="_blank" rel="noreferrer">Store</a>
      </div>
      ${game.error ? `<p class="row-warning">${escapeHtml(game.error)}</p>` : ""}
    </article>
  `;
}

function renderSparkline(values: number[]): string {
  if (values.length < 2) {
    return `<span class="spark-empty">New</span>`;
  }

  const width = 118;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return `
    <svg viewBox="0 0 ${width} ${height}" focusable="false">
      <polyline points="${points}" />
    </svg>
  `;
}

function bindEvents(): void {
  document.querySelector<HTMLInputElement>("#search")?.addEventListener("input", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    state.query = input.value;
    renderShell();
  });

  document.querySelector<HTMLSelectElement>("#sort")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    state.sortKey = select.value as SortKey;
    renderShell();
  });

  document.querySelector<HTMLButtonElement>("#favoritesOnly")?.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    renderShell();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      const appid = Number(button.dataset.favorite);

      if (state.favoriteIds.has(appid)) {
        state.favoriteIds.delete(appid);
      } else {
        state.favoriteIds.add(appid);
      }

      writeFavorites(state.favoriteIds);
      renderShell();
    });
  });
}

function restoreFocus(activeId: string | undefined): void {
  if (activeId !== "search") {
    return;
  }

  const search = document.querySelector<HTMLInputElement>("#search");
  search?.focus();
  search?.setSelectionRange(state.query.length, state.query.length);
}

function readFavorites(): Set<number> {
  try {
    const stored = JSON.parse(localStorage.getItem("steam-monitor:favorites") ?? "[]");
    return new Set(
      Array.isArray(stored)
        ? stored.filter((value) => Number.isFinite(value)).map(Number)
        : []
    );
  } catch {
    return new Set();
  }
}

function writeFavorites(favorites: Set<number>): void {
  localStorage.setItem(
    "steam-monitor:favorites",
    JSON.stringify([...favorites].sort((left, right) => left - right))
  );
}

function statusLabel(stale: boolean, unavailable: number): string {
  if (stale) {
    return "Stale data";
  }

  if (unavailable > 0) {
    return `${unavailable} unavailable`;
  }

  return "Live snapshot";
}

function noticeText(stale: boolean, message: string): string {
  if (stale) {
    return "The latest successful Steam snapshot is older than 30 minutes. The table is still showing the newest saved data.";
  }

  return message;
}

function formatPlayers(value: number | null): string {
  return Number.isFinite(value) ? numberFormatter.format(Number(value)) : "Unavailable";
}

function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "No baseline";
  }

  if (value === 0) {
    return "0";
  }

  return `${value > 0 ? "+" : ""}${numberFormatter.format(Number(value))}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : dateFormatter.format(date);
}

function starIcon(filled: boolean): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.8z" ${filled ? "" : "fill=\"none\""} />
    </svg>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
