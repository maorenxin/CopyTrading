# Strategy Backtest Results

## Goal
- ARR > 30%
- MDD < 10%  
- Backtest > 2 years
- Instrument: Hyperliquid perps
- Approach: Short fundamentally weak alts, Long/Short market-neutral

## Conclusion

**经过 200+ 组参数、7 种方法论的穷举测试，ARR>30% AND MDD<10% 在 2 年以上的回测中无法同时达成。**

### Why?

The best-achievable Sharpe ratio for cross-sectional momentum L/S on crypto is **1.41** over 4 years (2022-03 to 2026-06, 74 coins, no exclusions, 1bp maker fees).

The mathematical constraint:
- `MDD < 10% → max leverage ≈ 0.21x → ARR ≈ 15.6%`
- `ARR > 30% → min leverage ≈ 0.40x → MDD ≈ 16.5%`
- Both goals simultaneously require **Sharpe > 3.0**, which no known systematic strategy achieves over multiple market cycles.

### Dynamic Universe Filter: Tested & Failed

All attempts to create a dynamic coin selection rule that improves performance:

| Method | Sharpe | vs Baseline (1.41) | Issue |
|--------|--------|--------------------|-------|
| Rolling autocorrelation (30-90d) | -0.19 ~ -0.88 | Much worse | Too noisy, kills diversification |
| Variance ratio (60-90d) | 0.23 ~ 0.61 | Worse | Same issue |
| Rolling signal PnL (30-120d) | 0.47 ~ 0.70 | Worse | Always lagging |
| Volatility percentile filter | 0.64 ~ 1.20 | Worse | Cuts useful coins too |
| Confidence-weighted positions | 0.76 ~ 1.07 | Worse | Adds noise vs equal-weight |
| Walk-forward leave-one-out | 1.03 ~ 1.15 | Slightly worse | No persistence |

**Root cause**: "Harmful" coins are NOT persistently harmful. Their signal effectiveness flips every few months. No forward-looking metric can reliably predict which coins will be mean-reverting next.

Evidence: 
- SUSHI: 5 positive quarters, 12 negative (looks harmful, but 30% of time it helps)
- IOTA: labeled "harmful" on full period, but 10/18 quarters positive
- Train (2022-2024) identified DYDX, SUSHI, MINA as harmful → test (2024-2026) shows no benefit from excluding them

### The Only Legitimate Dynamic Rule

**Universe entry criterion: ≥365 days of HL price history**

This is already a dynamic filter:
- Coins auto-join when they accumulate 1 year of HL data
- Coins auto-exit when delisted
- Naturally excludes meme coins (PEPE, WIF, FLOKI etc. all < 1yr when listed)
- No overfitting, no look-ahead, fully mechanical

### What Was Tested (exhaustive)

| Approach | Best Sharpe | Issue |
|----------|-------------|-------|
| Cross-sectional momentum L/S | 1.41 | Sharpe ceiling |
| Multi-signal (momentum + MR + vol) | 1.30 | Signals correlated, no improvement |
| Regime-adaptive (BTC filter) | 1.32 | Filter removes profitable periods too |
| Conditional entry/exit | 1.51 | MDD still high when active |
| Portfolio stop-loss + cooldown | 1.74 | Cumulative stops create global MDD |
| Position-level stops | ∞ (biased) | Look-ahead bias, not implementable |
| Asymmetric (Kelly) sizing | 1.08 | Doesn't break Sharpe ceiling |
| Funding rate carry | +1.5% APR | Actual HL rates too low to matter |
| Short alts + Long BTC hedge | -0.12 | Alt beta > 1, hedge insufficient |
| Different rebalance frequencies | 1.70 max | Daily is optimal |
| Fee optimization (maker orders) | +0.20 Sharpe | Helps but not enough |
| Static coin exclusion (10 coins) | 1.84 | Overfitted, fails walk-forward |
| Dynamic autocorrelation filter | -0.88 ~ 0.70 | No predictive power |
| Dynamic volatility filter | 0.64 ~ 1.20 | Worse than no filter |
| Expanded universe (228 coins) | 0.45 ~ 0.65 | Meme coins add noise |

### Best Achievable Results (4yr backtest, honest, no exclusions)

| Option | Config | ARR | MDD | Sharpe | Calmar |
|--------|--------|-----|-----|--------|--------|
| A. MDD<10% | L7/S15 lev=0.21 | +15.6% | 9.0% | 1.41 | 1.74 |
| B. Balanced | L7/S15 lev=0.30 | +22.4% | 12.6% | 1.40 | 1.77 |
| C. ARR~30% | L7/S15 lev=0.40 | +30.2% | 16.5% | 1.40 | 1.83 |

### Strategy Specification (Recommended: Option A)

| Parameter | Value |
|-----------|-------|
| Long positions | 7 (bottom momentum quintile vs BTC) |
| Short positions | 15 (top momentum quintile vs BTC) |
| Signal | 14-day relative return vs BTC, cross-sectional rank |
| Universe | All HL perps with ≥365 days of price history (~74 coins) |
| Universe update | Quarterly review (auto-add coins reaching 1yr) |
| Rebalance | Daily (maker limit orders) |
| Gross leverage | 0.42x (0.21x each side) |
| Fee assumption | 1bp effective (maker rebate + slippage) |
| Win months | 62% |
| Sortino | 2.39 |
| Backtest period | 4.1 years (2022-03 to 2026-06), 74 coins |
| Exclude | BTC, HYPE only (structural reasons) |

### Path to Potentially Hit Both Goals

To achieve ARR>30% AND MDD<10% requires Sharpe > 3.0. Possible routes:

1. **Combine 2+ uncorrelated strategies**
   - If momentum L/S (Sharpe 1.4) + mean-reversion stat-arb (Sharpe 1.4) with corr=0.2
   - Combined Sharpe ≈ 1.9 → still not enough
   - Need 3+ independent alpha streams

2. **Higher-frequency execution**
   - 4h or 8h rebalance could improve Sharpe if signals are faster
   - Requires much lower fees (0.1bp via maker spread)
   - Increases operational complexity

3. **Selective market timing**
   - Only trade when market structure favors momentum (high dispersion)
   - Reduces time-in-market, may preserve Sharpe on invested capital
   - But reduces absolute PnL
