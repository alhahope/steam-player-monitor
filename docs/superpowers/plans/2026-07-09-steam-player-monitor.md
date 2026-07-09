# Steam Player Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Pages dashboard that tracks concurrent players for 50 popular Steam games and refreshes through GitHub Actions every 10 minutes.

**Architecture:** A Vite static frontend reads JSON files from `public/data/`. A Node.js script updates those JSON files by calling Steam chart, app details, and player count endpoints. One GitHub Actions workflow updates data, commits changed JSON, builds the frontend, and deploys Pages.

**Tech Stack:** Node.js 24, Vite, TypeScript, Node built-in test runner, GitHub Actions, GitHub Pages.

## Global Constraints

- The deployed site must be static and compatible with GitHub Pages.
- Data refresh interval must be 10 minutes.
- The default tracked game count must be 50.
- The frontend must not call Steam APIs directly.
- The UI must start on the dashboard itself, not a marketing landing page.
- Failed Steam requests must not erase previous usable data.
- New production behavior must be covered by tests before implementation.

---

## File Structure

- `package.json`: npm scripts and dependencies.
- `tsconfig.json`: TypeScript compiler settings for the frontend.
- `vite.config.ts`: Vite config with relative asset base for GitHub Pages.
- `index.html`: Static app entry.
- `src/main.ts`: Frontend state, data loading, rendering, sorting, search, favorites, and stale-data warnings.
- `src/styles.css`: Responsive operations-dashboard styling.
- `scripts/updateSteamData.mjs`: Steam data fetching, normalization, failure fallback, and JSON writes.
- `scripts/updateSteamData.test.mjs`: Node tests for normalization, history merging, stale fallback, and sorting helpers.
- `public/data/current.json`: Seed current snapshot.
- `public/data/history.json`: Seed recent history.
- `public/data/app-cache.json`: Seed app metadata cache.
- `.github/workflows/steam-monitor.yml`: Scheduled update, commit, build, and Pages deployment workflow.

---

### Task 1: Project Scaffold And Data Seeds

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `public/data/current.json`
- Create: `public/data/history.json`
- Create: `public/data/app-cache.json`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `test`, and `update:data`.
- Produces: frontend-readable `public/data/current.json` and `public/data/history.json`.

- [ ] **Step 1: Create package and config files**

Create a Vite TypeScript app with npm scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --test scripts/*.test.mjs",
    "update:data": "node scripts/updateSteamData.mjs"
  },
  "dependencies": {
    "@vitejs/plugin-legacy": "^7.2.1",
    "vite": "^7.0.0",
    "typescript": "^5.8.0"
  },
  "devDependencies": {}
}
```

- [ ] **Step 2: Create seed JSON files**

Create valid JSON with an empty successful snapshot:

```json
{
  "generatedAt": "1970-01-01T00:00:00.000Z",
  "source": "seed",
  "status": {
    "ok": true,
    "message": "Seed data. Run npm run update:data to fetch Steam data."
  },
  "games": []
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and npm exits 0.

- [ ] **Step 4: Verify scaffold build fails until frontend exists**

Run: `npm run build`

Expected: FAIL because `src/main.ts` does not exist yet.

- [ ] **Step 5: Commit scaffold**

Run:

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html public/data
git commit -m "chore: scaffold steam monitor app"
```

### Task 2: Data Normalization Tests And Update Script

**Files:**
- Create: `scripts/updateSteamData.test.mjs`
- Create: `scripts/updateSteamData.mjs`

**Interfaces:**
- Produces: `normalizeRank(rawRank, previousGame)` returning a game source object.
- Produces: `mergeHistory(previousHistory, games, generatedAt, limit)` returning recent history.
- Produces: `buildSnapshot(chartRanks, appCache, playerCounts, previousCurrent, generatedAt)` returning current snapshot data.

- [ ] **Step 1: Write failing tests**

Add tests that import `normalizeRank`, `mergeHistory`, and `buildSnapshot` from `scripts/updateSteamData.mjs` and assert:

```js
assert.equal(normalizeRank({ rank: 2, appid: 570, last_week_rank: 4, peak_in_game: 700000 }).appid, 570);
assert.equal(mergeHistory({ samples: [] }, [{ appid: 570, currentPlayers: 10 }], "2026-07-09T00:00:00.000Z", 1).samples.length, 1);
assert.equal(buildSnapshot([{ rank: 1, appid: 730 }], { "730": { name: "Counter-Strike 2" } }, { "730": 42 }, null, "2026-07-09T00:00:00.000Z").games[0].currentPlayers, 42);
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test`

Expected: FAIL with a module-not-found or missing-export error.

- [ ] **Step 3: Implement update script**

Implement exported pure functions plus a `main()` that:

```js
const CHART_URL = "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/?format=json";
const PLAYER_URL = "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/";
const APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const TRACKED_GAME_COUNT = 50;
const HISTORY_LIMIT = 144;
```

The script loads previous JSON, fetches chart ranks, fetches missing app metadata, fetches player counts with limited concurrency, writes current/history/cache JSON atomically, and keeps previous usable data on failures.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test`

Expected: PASS with all Node tests passing.

- [ ] **Step 5: Run data update locally**

Run: `npm run update:data`

Expected: exits 0 and writes 50 games into `public/data/current.json`.

- [ ] **Step 6: Commit data script**

Run:

```bash
git add scripts public/data
git commit -m "feat: add steam data updater"
```

### Task 3: Frontend Dashboard

**Files:**
- Create: `src/main.ts`
- Create: `src/styles.css`

**Interfaces:**
- Consumes: `public/data/current.json` with `games[]`.
- Consumes: `public/data/history.json` with `samples[]`.
- Produces: rendered dashboard in `#app`.

- [ ] **Step 1: Write frontend code**

Create a TypeScript frontend that:

```ts
type SortKey = "rank" | "players" | "change" | "name";
type Game = {
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
```

It fetches `./data/current.json` and `./data/history.json`, stores favorites in `localStorage`, filters by search text, sorts by the selected key, and renders a compact card/table list with sparklines.

- [ ] **Step 2: Add responsive CSS**

Style the dashboard with stable table/card dimensions, 8px-or-smaller radii, readable player numbers, mobile wrapping, and non-overlapping controls.

- [ ] **Step 3: Build frontend**

Run: `npm run build`

Expected: PASS and creates `dist/`.

- [ ] **Step 4: Commit frontend**

Run:

```bash
git add src index.html
git commit -m "feat: build steam dashboard UI"
```

### Task 4: GitHub Actions Pages Deployment

**Files:**
- Create: `.github/workflows/steam-monitor.yml`

**Interfaces:**
- Consumes: npm scripts from `package.json`.
- Produces: deployed GitHub Pages artifact.

- [ ] **Step 1: Create workflow**

Create a workflow with:

```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch:
```

It checks out code, installs Node, runs `npm ci`, runs `npm run update:data`, commits changed files under `public/data`, runs `npm run build`, uploads `dist`, and deploys Pages.

- [ ] **Step 2: Validate workflow syntax by build/test locally**

Run: `npm test && npm run build`

Expected: PASS.

- [ ] **Step 3: Commit workflow**

Run:

```bash
git add .github/workflows/steam-monitor.yml
git commit -m "ci: add scheduled pages deployment"
```

### Task 5: Repository Publication

**Files:**
- Modify: Git remote state only.

**Interfaces:**
- Produces: a public GitHub repository named `steam-player-monitor`.
- Produces: a pushed `main` branch.

- [ ] **Step 1: Merge feature branch into main**

Run:

```bash
git switch main
git merge --no-ff feat/steam-player-monitor -m "merge steam monitor implementation"
```

- [ ] **Step 2: Create GitHub repository**

Run:

```bash
gh repo create steam-player-monitor --public --source=. --remote=origin --push
```

- [ ] **Step 3: Verify remote**

Run: `gh repo view --web=false`

Expected: command exits 0 and shows the new repository.

### Task 6: Final Verification

**Files:**
- Read-only verification.

**Interfaces:**
- Consumes: local build, git status, and GitHub Actions state.
- Produces: final deployment URL for the user.

- [ ] **Step 1: Run final checks**

Run:

```bash
npm test
npm run build
git status --short
```

Expected: tests and build exit 0; git status has no uncommitted files except data files changed by a fresh update, which must be committed before final.

- [ ] **Step 2: Check GitHub Actions**

Run:

```bash
gh run list --limit 5
```

Expected: the Pages workflow appears. If it is still running, wait and inspect status.

- [ ] **Step 3: Report URLs**

Report the repository URL and Pages URL. If Pages deployment is still pending, report the repository URL and the exact workflow status.

---

## Self-Review

- Spec coverage: The plan covers static frontend, 50 games, scheduled updates, error fallback, JSON data, GitHub Pages, tests, and deployment.
- Placeholder scan: No deferred implementation markers remain.
- Type consistency: `Game`, snapshot JSON, and script outputs all use `appid`, `rank`, `currentPlayers`, `previousPlayers`, `change`, `capsuleUrl`, and `storeUrl`.
