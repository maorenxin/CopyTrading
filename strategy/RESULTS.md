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

The best-achievable Sharpe ratio for cross-sectional momentum L/S on crypto is **1.70** over 5.5 years (2020-12 to 2026-06, 75 coins, 1bp maker fees).

The empirical constraint:
- `MDD < 10% → max leverage ≈ 0.16x → ARR ≈ 19%`
- `ARR > 30% → min leverage ≈ 0.25x → MDD ≈ 14.4%`
- Both goals simultaneously require **Calmar > 3.0** (i.e. Sharpe > 4.5), which no known systematic strategy achieves over multiple market cycles.

### What Was Tested (exhaustive)

| Approach | Best Sharpe | Issue |
|----------|-------------|-------|
| Cross-sectional momentum L/S | 1.70 | Sharpe ceiling |
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

### Best Achievable Results (5.5yr backtest, 1bp fees)

| Option | Config | ARR | MDD | Sharpe | Calmar | Sortino |
|--------|--------|-----|-----|--------|--------|---------|
| A. MDD<10% | L7/S15 lev0.16 | +19.2% | 9.4% | 1.70 | 2.04 | 3.04 |
| B. ARR~30% | L7/S15 lev0.25 | +30.9% | 14.4% | 1.70 | 2.15 | 3.03 |
| C. Balanced | L7/S15 lev0.20 | +24.3% | 11.6% | 1.70 | 2.09 | 3.03 |

### Strategy Specification (Recommended: Option C)

| Parameter | Value |
|-----------|-------|
| Long positions | 7 (bottom momentum quintile vs BTC) |
| Short positions | 15 (top momentum quintile vs BTC) |
| Signal | 14-day relative return vs BTC, cross-sectional rank |
| Rebalance | Daily (maker limit orders) |
| Gross leverage | 0.40x (0.20x each side) |
| Fee assumption | 1bp effective (maker rebate + slippage) |
| Win months | 64% |
| Sortino | 3.03 |
| Backtest period | 5.5 years (2020-12 to 2026-06), 75 coins |
| Key drawdown events | 2021-06 (12.7%), 2023-02 (11.9%), 2024-09 (9.6%) |

### What Was Tested (exhaustive detail)

1. **Signals**: Momentum (14d, 7d, 21d), mean reversion (5d/20d), cross-sectional volatility, funding rate, MCap/FDV inflation
2. **Portfolio**: L5/S15, L7/S15, L7/S20, L10/S10, L3/S8, L3/S20 (7 configurations)
3. **Regime filters**: BTC MA(20/30/50/60), BTC deviation thresholds (10-50%), alt-BTC correlation, cross-sectional dispersion
4. **Risk management**: Portfolio stops (3-7%), position stops (10-20%), cooldowns (3-14d), vol targeting (5-25%), trailing stops
5. **Sizing**: Fixed, asymmetric (Kelly), vol-targeted, regime-scaled, signal-strength-weighted
6. **Entry/exit**: Always-in, conditional (binary), regime-adaptive (continuous)
7. **Fees**: 0bp to 5.5bp tested (proves strategy is fee-robust at 1bp)
8. **Rebalance**: Daily, 2d, 3d, 5d, 7d, 10d, 14d
9. **Funding carry**: Actual HL rates analyzed (too low: avg 0.0014%/8h = 1.5% APR)
10. **BTC hedge**: Dollar-neutral, beta-neutral — worse than alt-vs-alt L/S

### Path to Potentially Hit Both Goals

To achieve ARR>30% AND MDD<10% requires Calmar > 3.0. Possible routes:

1. **Combine 2 uncorrelated strategies** (e.g., momentum L/S + statistical arbitrage)
   - If both have Sharpe 1.7 and correlation < 0.3, combined Sharpe ≈ 2.4
   - At Sharpe 2.4: lev 0.18 → ARR ~30%, MDD ~8%
   
2. **Include funding carry** if alt funding rates increase:
   - Need net ~2bp/8h (current: ~0.15bp/8h)
   - Possible in strong bull markets (would need forward-looking data)

3. **Restrict to post-2022 only** and accept survivorship bias:
   - Post-2023-06: Sharpe 1.88 → still ARR 26% at MDD 10%
   - Not an honest 2-year backtest across market cycles
