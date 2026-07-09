# Steam 热门游戏在线人数监控

这是一个部署在 GitHub Pages 上的 Steam 热门游戏在线人数监控网页。它默认追踪 50 款 Steam 热门游戏，展示当前在线人数、排名、人数变化、更新时间和短期趋势。

## 功能

- 默认监控 Steam 热门榜前 50 个游戏
- GitHub Actions 每 10 分钟自动更新一次数据
- 首页直接展示监控仪表盘，适合快速查看
- 支持搜索、排序和本地收藏游戏
- 支持桌面和手机端访问
- 当 Steam 接口临时失败时保留上一轮可用数据

## 数据来源

- 热门游戏列表来自 Steam Charts / Steam Most Played 相关公开接口
- 在线人数来自 Valve `ISteamUserStats/GetNumberOfCurrentPlayers`
- 浏览器端只读取仓库里的 JSON 数据，不直接请求 Steam API

## 本地运行

```bash
npm install
npm run update:data
npm run dev
```

## 构建和测试

```bash
npm test
npm run build
```

## 部署

仓库包含 `.github/workflows/steam-monitor.yml`。推送到 `main` 后，GitHub Actions 会更新数据、构建网页并部署到 GitHub Pages。
