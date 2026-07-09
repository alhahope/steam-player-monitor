# Steam Player Monitor Design

## Goal

Build and deploy a GitHub Pages site that monitors concurrent player counts for 50 popular Steam games. The site should be useful at a glance, mobile-friendly, and maintain itself through scheduled GitHub Actions updates.

## Scope

- Create a new GitHub repository for the site.
- Deploy a static frontend with GitHub Pages.
- Track 50 popular Steam games by default.
- Refresh data on a 10-minute GitHub Actions schedule.
- Show current players, rank, change since previous update, last updated time, and a small recent trend.
- Support search, sort, and local favorites.

## Architecture

The project is a static Vite application. A Node.js update script fetches Steam's most-played chart data, keeps the top 50 games, fetches concurrent player counts from Valve's `ISteamUserStats/GetNumberOfCurrentPlayers` endpoint, and writes JSON files into `public/data/`.

GitHub Actions runs the update script every 10 minutes and commits changed JSON files back to the repository. GitHub Pages serves the built static app. The browser reads only local JSON files from the deployed site, so visitors do not call Steam APIs directly.

## Data Flow

1. `scripts/updateSteamData.mjs` fetches the current Steam most-played list.
2. The script selects 50 entries with app IDs and names.
3. The script requests concurrent player counts for each app ID.
4. The script merges the new snapshot with existing history.
5. The script writes:
   - `public/data/current.json`
   - `public/data/history.json`
6. The frontend loads those JSON files and renders the dashboard.

## Frontend

The first screen is the dashboard itself, not a landing page. It includes:

- Compact header with title, last updated timestamp, and total tracked games.
- Search input.
- Sort control for rank, current players, change, and game name.
- Favorites toggle stored in `localStorage`.
- Responsive table/cards for 50 games.
- Small inline sparkline per game from recent history.
- Clear stale-data and failed-data states.

The visual style should feel like an operations dashboard: dense, readable, restrained, and optimized for repeated scanning.

## Error Handling

- If Steam chart fetching fails, the update script keeps the previous data and writes a status error into `current.json`.
- If one game's player-count request fails, that game keeps its previous count and receives an error flag.
- The frontend displays the last successful update and a warning when data is stale.
- The GitHub Action should not erase previous usable data on transient API failures.

## Testing And Verification

- Unit-test data normalization and history merging.
- Run the data update script locally.
- Build the Vite app.
- Preview the app locally and inspect desktop and mobile layouts.
- After deployment, confirm the GitHub Pages URL loads and `data/current.json` is reachable.

## Deployment

Use GitHub CLI to create a new public repository, push the local branch, and configure GitHub Pages through the repository workflow. The site is deployed by Actions from the static build output.

## External Sources

- Steam Most Played chart: https://store.steampowered.com/charts/mostplayed
- Valve player count API: https://partner.steamgames.com/doc/webapi/isteamuserstats#GetNumberOfCurrentPlayers
