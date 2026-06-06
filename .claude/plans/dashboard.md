# Paper Trading Dashboard 计划

## 架构

**后端 (Python FastAPI)** — `dashboard/`
- 复用 `strategy/` 现有代码计算信号
- Paper trading 引擎：模拟仓位、每日 rebalance、记录 PnL
- SQLite 持久化（仓位、交易、每日快照）
- REST API 供前端消费

**前端 (React)** — 在现有 `src/` 中增加 dashboard 页面
- 复用 cyberpunk 主题、Recharts、shadcn/ui 组件
- 通过 Vite proxy 开发时连接后端 API

## 后端模块 (`dashboard/`)

```
dashboard/
├── main.py              # FastAPI 入口
├── config.py            # 策略参数（从 RESULTS.md 提取的最终配置）
├── signal.py            # 信号计算（复用 engine_honest.py 的 momentum 逻辑）
├── paper_engine.py      # Paper trading 核心：仓位管理、rebalance、PnL
├── scheduler.py         # APScheduler 每日定时计算（UTC 00:05）
├── db.py                # SQLite schema + CRUD
└── requirements.txt     # fastapi, uvicorn, pandas, numpy, apscheduler, sqlite
```

### 数据库 Schema (SQLite)

```sql
-- 每日快照
daily_snapshots (
  date TEXT PRIMARY KEY,
  equity REAL,
  daily_pnl REAL,
  cumulative_pnl REAL,
  drawdown REAL,
  leverage REAL,
  n_longs INTEGER,
  n_shorts INTEGER,
  fees REAL,
  mode TEXT  -- 'paper' | 'live'
)

-- 当前和历史仓位
positions (
  id INTEGER PRIMARY KEY,
  date TEXT,
  coin TEXT,
  side TEXT,  -- 'long' | 'short'
  notional REAL,
  entry_price REAL,
  signal_score REAL,
  daily_pnl REAL
)

-- 交易记录
trades (
  id INTEGER PRIMARY KEY,
  date TEXT,
  coin TEXT,
  action TEXT,  -- 'open_long' | 'open_short' | 'close_long' | 'close_short'
  notional REAL,
  price REAL,
  fee REAL
)

-- 每日信号排名
daily_signals (
  date TEXT,
  coin TEXT,
  momentum_score REAL,
  rank INTEGER,
  selected TEXT,  -- 'long' | 'short' | null
  PRIMARY KEY(date, coin)
)
```

### API Endpoints

```
GET  /api/status           # 策略状态：mode、equity、today's PnL、总收益
GET  /api/positions        # 当前持仓（coin, side, notional, unrealized PnL）
GET  /api/history          # 每日快照时间序列
GET  /api/trades?days=30   # 近 N 天交易记录
GET  /api/signals          # 今日全部信号评分 + 选中标记
GET  /api/metrics          # 累计指标（Sharpe, ARR, MDD, Sortino, win rate）
POST /api/rebalance        # 手动触发 rebalance（测试用）
POST /api/config           # 修改参数（mode 切换等）
```

## 前端页面

新增路由 `/#/dashboard`，4 个主要面板：

### 1. Strategy Overview（顶部卡片行）
- 当前 equity | 今日 PnL | 累计 PnL | Sharpe | MDD | Mode(paper/live)
- 运行天数 | 胜率

### 2. Equity Curve（主图表）
- 累计权益曲线 (Recharts LineChart)
- 每日 PnL bar chart（叠加）
- Drawdown 区域图

### 3. Current Positions（仓位表格）
- 7 Long + 15 Short 当前持仓
- 列：Coin | Side | Notional | Entry Price | Current Price | PnL | Signal Score
- 颜色编码：绿涨红跌

### 4. Signal Rankings（信号面板）
- 今日全部 coin 的 momentum score 排名
- 高亮 long/short 选中的 coin
- 与昨天的排名变化（↑↓）

### 5. Trade Log（底部）
- 可滚动的交易记录表
- 筛选：日期、coin、side

## 执行计划

1. **后端核心** → 验证：API 能返回正确的信号计算结果
   - `dashboard/config.py` — 策略参数
   - `dashboard/db.py` — SQLite schema
   - `dashboard/signal.py` — 信号计算（读取 crypto_data/ 的价格 CSV）
   - `dashboard/paper_engine.py` — paper trading 逻辑
   - `dashboard/main.py` — FastAPI routes
   - `dashboard/scheduler.py` — 定时任务

2. **前端 Dashboard** → 验证：`npm run dev` 能看到完整 dashboard
   - 路由配置（react-router）
   - Dashboard 主页面 + 子组件
   - API 调用 hook

3. **启动脚本** → 验证：一条命令启动前后端
   - `start-dashboard.sh` — 同时启动 uvicorn + vite dev

## 策略参数（来自 RESULTS.md）

```python
N_LONG = 7
N_SHORT = 15
LEVERAGE = 0.21
MOMENTUM_WINDOW = 14  # days
FEE_BPS = 1.4  # blended maker+taker
INITIAL_CAPITAL = 20_000
EXCLUDE = ["BTC", "HYPE", "UNI", "SUSHI", "DYDX", "GMX"]  # DEX excluded
MIN_HISTORY_DAYS = 365
REBALANCE_HOUR = 0  # UTC 00:00
```

## 技术选型理由

- **FastAPI**：Python 策略代码直接复用，无需 port 到 Node
- **SQLite**：单用户 paper trading，无需 Postgres
- **APScheduler**：轻量定时，不需要 celery
- **Vite proxy**：开发时 `/api` 代理到 FastAPI，无 CORS 问题
- **React Router**：现有项目加一个 hash route，不影响 GitHub Pages 主站
