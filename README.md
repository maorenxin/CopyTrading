# CopyTrading

Hyperliquid Vault 跟单排行榜，纯静态站点部署在 GitHub Pages。

**在线地址**: https://maorenxin.github.io/CopyTrading/

## 技术栈

- 前端: Vite + React + TypeScript + shadcn/ui
- 数据: GitHub Actions 每日定时爬取 Hyperliquid API
- 部署: GitHub Pages（push to master 自动触发）

## 数据管道

每日 UTC 02:23（北京时间 10:23）自动运行：

```
scrape-vaults.ts    → VAULTS.csv (从 stats-data.hyperliquid.xyz 获取 TVL≥10k 的 vault)
scrape-trades.ts    → vault_trades_data/*.csv (增量抓取交易记录)
scrape-cashflows.ts → vault_funding_data/*.csv + vault_nonfunding_ledger/*.csv
download-prices.py  → crypto_data/*.csv (BTC等币种小时K线)
vault-quantstats.py → vault_quantstat.csv (量化指标计算)
generate-static-data.ts → public/data/traders.json (前端数据)
```

也可在 [Actions 页面](https://github.com/maorenxin/CopyTrading/actions/workflows/daily-update.yml) 手动触发。

## 本地开发

```bash
npm i
npm run dev
```

## 本地运行数据管道

```bash
pip install -r requirements.txt
npx ts-node --transpile-only scripts/scrape-vaults.ts
npx ts-node --transpile-only scripts/scrape-trades.ts
npx ts-node --transpile-only scripts/scrape-cashflows.ts
python scripts/download-prices.py
python server/scripts/vault-quantstats.py
npx ts-node --transpile-only scripts/generate-static-data.ts
```

## 环境变量（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VAULT_MIN_TVL` | vault 最低 TVL 筛选阈值 | `10000` |
| `VAULT_SLEEP_MS` | API 请求间隔(ms) | `200` |
| `HTTPS_PROXY` | HTTP 代理地址 | - |
