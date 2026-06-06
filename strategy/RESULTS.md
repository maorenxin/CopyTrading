# Strategy Backtest Results

## Goal
- ARR > 30%
- MDD < 10%  
- Backtest > 2 years
- Instrument: Hyperliquid perps
- Approach: Short fundamentally weak alts, Long/Short market-neutral

## Final Conclusion

**ARR>30% AND MDD<10% 无法同时达成。** 这是数学约束，不是策略问题。

最佳诚实 Sharpe = 1.59（排除 DEX 代币后）。在此 Sharpe 下：
- MDD<10% → 最大 ARR ≈ 17.6%
- ARR>30% → 最小 MDD ≈ 15.2%
- 同时满足需要 Sharpe > 3.0，任何单一流动策略在跨周期回测中无法达到。

---

## Recommended Strategy

| Parameter | Value |
|-----------|-------|
| Signal | 14-day relative return vs BTC, cross-sectional rank |
| Long positions | 7 (bottom momentum quintile) |
| Short positions | 15 (top momentum quintile) |
| Universe | All HL perps with ≥365d history, **排除 DEX 代币** |
| Excluded | BTC, HYPE (structural), UNI, SUSHI, DYDX, GMX (DEX tokens) |
| Rebalance | Daily (maker limit orders) |
| Leverage | 0.21x per side (0.42x gross) |
| Fee assumption | 1bp effective (maker rebate + slippage) |

### Performance (4yr backtest, 2022-03 → 2026-06, honest, no look-ahead)

| Metric | Value |
|--------|-------|
| ARR | +17.6% |
| Sharpe | 1.59 |
| Sortino | 2.71 |
| MDD | 9.4% |
| Calmar | 1.88 |
| Vol | 10.7% |
| Win months | 62% |

### Leverage Options

| Lev | ARR | MDD | Sharpe | Use case |
|-----|-----|-----|--------|----------|
| 0.15 | +12.7% | 6.8% | 1.62 | Ultra-conservative |
| 0.21 | +17.6% | 9.4% | 1.59 | **Recommended** |
| 0.30 | +25.4% | 13.2% | 1.58 | Higher return tolerance |
| 0.40 | +34.6% | 17.3% | 1.58 | Aggressive |

---

## Universe: 70 Tokens (74 - 4 DEX)

### Sector Breakdown

| Sector | Count | Tokens |
|--------|-------|--------|
| L1 | 26 | ETH SOL ADA AVAX DOT ATOM NEAR APT SUI FTM ALGO ICP HBAR STX XLM XRP ETC LTC BCH BNB TRX NEO IOTA CELO MINA CFX |
| DeFi (non-DEX) | 11 | AAVE COMP MKR SNX PENDLE LDO FXS STG RUNE INJ CRV |
| Meme | 6 | DOGE KSHIB KPEPE KFLOKI KLUNC PEOPLE |
| Gaming/NFT | 10 | AXS SAND IMX GALA YGG APE BLUR ENS GMT WLD |
| Infra/Storage | 7 | FIL AR FET LINK BLZ OP ARB |
| Other | 10 | DASH XMR ZEC ZEN TRB RSR OGN UMA MAV MATIC |
| **Excluded (DEX)** | **4** | **UNI SUSHI DYDX GMX** |

### Entry/Exit Rules

- **Entry**: coin accumulates ≥365 days of HL price history → auto-join
- **Exit**: coin delisted from HL → auto-remove
- **Sector exclusion**: any DEX protocol token (provides AMM/orderbook trading) → exclude
- **Structural exclusion**: BTC (used as benchmark), HYPE (HL native token)

---

## Why Exclude DEX Tokens?

### Evidence

1. **Signal effectiveness = 0**: when momentum signal says short DEX tokens, hit rate is 50.8% (coin flip). Other coins have directional edge.
2. **Walk-forward validated**: improvement holds across all 3 test periods (2022→2023: +28%, 2023→2024: +17%, 2024→2026: +2%).
3. **Fundamental logic**: DEX token prices are driven by TVL/fee revenue cycles (cyclical, mean-reverting), not by cross-sectional momentum.
4. **Not cherry-picking individuals**: this is a sector rule based on business model, not leave-one-out on specific tickers.

### Caveat

- The improvement in the most recent period (2024-11 → 2026-06) is minimal (+2%), suggesting the effect may be weakening.
- If new DEX tokens list on HL with 365d+ history, they should also be excluded.
- This is still somewhat data-fitted. A fully conservative approach would skip this rule and accept Sharpe=1.41.

---

## Dynamic Filtering: Tested & Failed

All attempts to build a dynamic coin selection rule:

| Method | Sharpe | vs Baseline (1.41) | Conclusion |
|--------|--------|--------------------|------------|
| Rolling autocorrelation (30-90d) | -0.88 ~ 0.70 | Much worse | Too noisy |
| Variance ratio (60-90d) | 0.23 ~ 0.61 | Worse | Same issue |
| Rolling signal PnL (30-120d) | 0.47 ~ 0.70 | Worse | Always lagging |
| Volatility percentile filter | 0.64 ~ 1.20 | Worse | Kills diversification |
| Confidence-weighted positions | 0.76 ~ 1.07 | Worse | Adds noise vs equal-weight |
| Walk-forward leave-one-out | 1.03 ~ 1.15 | Marginally worse | No persistence |
| Expanded universe (228 coins) | 0.45 ~ 0.65 | Much worse | Meme coin noise |

**Root cause**: "harmful" coins are not persistently harmful. Their signal effectiveness flips every few months. No forward-looking metric can reliably predict which coins will be mean-reverting next.

---

## Full Test History

| Approach | Best Sharpe | Issue |
|----------|-------------|-------|
| Cross-sectional momentum L/S | 1.41 | Baseline |
| + DEX exclusion (sector rule) | **1.59** | **Best honest result** |
| + Static 10-coin exclusion | 1.84 | Overfitted, fails OOS |
| Multi-signal (momentum + MR + vol) | 1.30 | Signals correlated |
| Regime-adaptive (BTC filter) | 1.32 | Removes profitable periods |
| Portfolio stop-loss + cooldown | 1.74 | Cumulative stops |
| Position-level stops | ∞ (biased) | Look-ahead bias |
| Asymmetric (Kelly) sizing | 1.08 | Doesn't break ceiling |
| Short alts + Long BTC hedge | -0.12 | Alt beta > 1 |
| Funding rate carry | +1.5% APR | HL rates too low |
| All dynamic filters | < 1.20 | No predictive power |

---

## Path to ARR>30% + MDD<10%

Requires Sharpe > 3.0. Possible routes (all speculative):

1. **Multiple uncorrelated alpha streams**: combine momentum L/S with stat-arb, carry, etc. Need 3+ strategies with low cross-correlation.
2. **Higher-frequency execution**: 4h/8h rebalance with sub-1bp fees. Requires custom infra.
3. **Leverage + portfolio insurance**: use options/funding to cap tail risk (not available on HL for alts).
