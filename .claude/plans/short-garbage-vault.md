# 系统化做空垃圾币 Vault — 实施计划

## 目标

构建一个回测验证过的做空策略，筛选"基本面恶化"的币种做空，最终部署为 Hyperliquid Vault 自动交易。

## 策略核心思路

**做空标的筛选 = 多维度打分**，综合以下信号：

1. **Token Unlock/Inflation（供给压力）**
   - MCap/FDV 比值低 → 大量代币未流通，未来抛压大
   - 即将到来的解锁事件（30 天内大额 cliff unlock）
   - 数据源：CoinGecko supply API（免费，有 rate limit）

2. **HL 原生数据（市场微观结构）**
   - Funding Rate 持续正值 → 多头拥挤，做空有利
   - OI 异常膨胀 → 杠杆过高，易被清洗
   - 价格相对 BTC 持续走弱（相对动量）
   - 数据源：HL API（免费无限制）

3. **链上鲸鱼出货（后续迭代加入）**
   - 大户向 CEX 转入
   - 持仓集中度下降
   - 数据源：Arkham API（需 key）/ Etherscan

## 数据依赖

| 信号 | 数据源 | 可用性 | 历史深度 |
|------|--------|--------|---------|
| 价格(1h K线) | 本地 `crypto_data/` | ✅ 已有 217 币 | 1-3 年 |
| Funding Rate | HL API `fundingHistory` | ✅ 免费 | 需拉取 |
| Open Interest | HL API `candleSnapshot` | ✅ 免费 | 需确认 |
| MCap/FDV | CoinGecko `/coins/{id}` | ✅ 免费(30 req/min) | 当前快照 |
| Token Unlock 日历 | CoinGecko supply + 手动维护 | ⚠️ 需手工标注大事件 | — |
| 鲸鱼链上数据 | Arkham / Nansen | ❌ 后续迭代 | — |

## 回测框架设计

```
strategy/
├── data/
│   ├── fetch_funding.py       # 拉取历史 funding rate → CSV
│   ├── fetch_supply.py        # 拉取 CoinGecko 供给数据 → CSV
│   └── price_loader.py        # 加载本地 crypto_data/ 价格
├── signals/
│   ├── inflation_score.py     # MCap/FDV + unlock 事件打分
│   ├── funding_score.py       # Funding rate 持续正值打分
│   ├── momentum_score.py      # 相对 BTC 动量打分
│   └── composite.py           # 综合打分 + 排名
├── backtest/
│   ├── engine.py              # 回测引擎（持仓管理、PnL、资金费）
│   ├── universe.py            # 可交易标的池（排除流动性不足的）
│   └── config.py              # 策略参数
├── analysis/
│   ├── report.py              # 生成 quantstats 报告
│   └── tearsheet.html         # 回测结果可视化
└── run_backtest.py            # 入口脚本
```

## 回测引擎核心逻辑

```python
# 伪代码
每日（或每 4h）再平衡:
  1. 计算所有币的综合做空分数
  2. 排名取 Top N（如前 15 名）作为做空篮子
  3. 等权分配做空仓位（单币 ≤ 5% 账户净值）
  4. 扣除 funding rate 成本（做空支付正 funding）
  5. 计算 taker 手续费（0.035%）
  6. 记录 PnL
```

**关键参数（需回测优化）：**
- `N_SHORTS`: 做空篮子大小（10-20）
- `REBALANCE_FREQ`: 再平衡频率（4h / 8h / 24h）
- `MAX_POSITION_PCT`: 单币最大仓位占比（3-7%）
- `TOTAL_LEVERAGE`: 总杠杆（1-3x）
- `MIN_LIQUIDITY`: 最低日均成交量门槛
- `MOMENTUM_WINDOW`: 动量计算窗口（7d / 14d / 30d）

## 实施步骤

### Phase 1: 数据管道（Day 1-2）
1. `fetch_funding.py` — 拉取 HL 所有币种过去 6 个月 funding rate 历史
2. `fetch_supply.py` — 拉取 CoinGecko 币种 MCap/FDV/供给数据
3. `price_loader.py` — 统一接口加载本地 K 线数据
4. 验证：数据完整性检查，输出可用币种列表

### Phase 2: 信号计算（Day 2-3）
5. `momentum_score.py` — 计算相对 BTC 的 N 日收益率，负越多分越高
6. `funding_score.py` — 计算 7 日平均 funding rate，正越大做空越 "免费"
7. `inflation_score.py` — MCap/FDV 比值打分，<0.5 为高通胀
8. `composite.py` — 加权合成总分（动量权重最大，因为有历史可回测）

### Phase 3: 回测引擎（Day 3-5）
9. `engine.py` — 核心回测循环：再平衡 + PnL + 费用 + 资金费
10. `universe.py` — 流动性过滤（排除日均交易量 < $1M 的币）
11. `config.py` — 参数定义，支持 grid search
12. 验证：对比 Orbit Value 的实际收益曲线做 sanity check

### Phase 4: 分析与优化（Day 5-7）
13. `report.py` — 输出 Sharpe/Sortino/MaxDD/Calmar + 月度收益表
14. 参数扫描：不同 N/freq/leverage 组合的 Sharpe 热力图
15. 样本外测试：用最近 2 个月数据做验证

### Phase 5: 实盘准备（验证通过后）
16. 执行层代码（TS，对接 HL Python SDK）
17. Testnet 纸面交易 1-2 周
18. 小资金实盘 → 稳定后开 Vault

## 成功标准

回测期间（6 个月+）：
- **Sharpe > 1.5**
- **Max Drawdown < 20%**
- **年化收益 > 50%**
- **月度胜率 > 60%**

如果达不到，逐步调整：降杠杆、缩小持仓数量、增加信号维度。

## 技术注意事项

- Funding rate 是做空的隐性成本：正 funding 时做空要付钱。回测必须计入。
- 借贷成本在 HL 上暂时为 0，但需监控。
- CoinGecko 免费 API 有 30 req/min 限制，数据拉取需做 rate limiting。
- 回测不考虑滑点对小币种的影响 — 实盘时用 TWAP 分批建仓。
- 价格数据截止到 2026-02-03，最新数据需先跑 `download-prices.py` 更新。
