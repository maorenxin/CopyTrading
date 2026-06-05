"""Composite signal: combine all scores into a final short ranking."""
import pandas as pd
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))

from momentum_score import rolling_momentum_scores
from funding_score import rolling_funding_scores, load_daily_funding
from inflation_score import inflation_score, load_supply_data


# Default weights for combining signals
DEFAULT_WEIGHTS = {
    "momentum": 0.50,   # Relative underperformance vs BTC
    "funding": 0.20,    # Positive funding = short gets paid
    "inflation": 0.30,  # Low MCap/FDV = high dilution
}


def compute_composite_scores(
    daily_closes: pd.DataFrame,
    daily_funding: pd.DataFrame | None = None,
    supply_df: pd.DataFrame | None = None,
    momentum_window: int = 14,
    funding_window: int = 7,
    weights: dict | None = None,
) -> pd.DataFrame:
    """Compute composite short scores for every day in the backtest period.

    Returns DataFrame: index=date, columns=coins, values=composite score (0-1).
    Higher score = stronger short candidate.
    """
    if weights is None:
        weights = DEFAULT_WEIGHTS

    coins = [c for c in daily_closes.columns if c != "BTC"]

    # 1. Momentum scores (time-varying)
    mom_scores = rolling_momentum_scores(daily_closes, window=momentum_window)
    mom_scores = mom_scores.reindex(columns=coins, fill_value=0)

    # 2. Funding scores (time-varying, if available)
    if daily_funding is not None and not daily_funding.empty:
        fund_scores = rolling_funding_scores(daily_funding, window=funding_window)
        fund_scores = fund_scores.reindex(index=mom_scores.index, columns=coins, fill_value=0)
        fund_scores = fund_scores.ffill().fillna(0)
    else:
        # If no funding data, distribute weight to momentum
        fund_scores = pd.DataFrame(0, index=mom_scores.index, columns=coins)
        weights = weights.copy()
        weights["momentum"] += weights["funding"]
        weights["funding"] = 0

    # 3. Inflation scores (static — snapshot based)
    if supply_df is not None:
        infl_scores = inflation_score(supply_df)
        # Broadcast static scores to all dates
        infl_series = pd.Series(0.0, index=coins)
        for coin in coins:
            if coin in infl_scores.index:
                infl_series[coin] = infl_scores[coin]
        infl_df = pd.DataFrame(
            [infl_series.values] * len(mom_scores),
            index=mom_scores.index,
            columns=coins,
        )
    else:
        infl_df = pd.DataFrame(0, index=mom_scores.index, columns=coins)
        weights = weights.copy()
        weights["momentum"] += weights["inflation"]
        weights["inflation"] = 0

    # Normalize weights
    total_w = sum(weights.values())
    w_mom = weights["momentum"] / total_w
    w_fund = weights["funding"] / total_w
    w_infl = weights["inflation"] / total_w

    # Combine
    composite = (
        mom_scores * w_mom +
        fund_scores * w_fund +
        infl_df * w_infl
    )

    return composite


def select_short_basket(
    composite_scores: pd.Series,
    n_shorts: int = 15,
    exclude: list[str] | None = None,
) -> list[str]:
    """Select top N coins to short based on composite score.

    Args:
        composite_scores: Series of scores for one day.
        n_shorts: Number of coins in short basket.
        exclude: Coins to never short (e.g., BTC, HYPE).
    """
    if exclude:
        composite_scores = composite_scores.drop(exclude, errors="ignore")

    # Remove NaN/zero scores
    valid = composite_scores[composite_scores > 0].dropna()
    top = valid.sort_values(ascending=False).head(n_shorts)
    return top.index.tolist()


if __name__ == "__main__":
    from price_loader import load_universe, get_daily_closes

    universe = load_universe(min_days=180)
    closes = get_daily_closes(universe)

    # Try loading funding and supply (may not exist yet)
    try:
        funding = load_daily_funding(list(universe.keys()))
    except Exception:
        funding = None

    try:
        supply = load_supply_data()
    except Exception:
        supply = None

    scores = compute_composite_scores(closes, funding, supply)
    latest = scores.iloc[-1]

    print(f"Composite scores computed: {scores.shape}")
    print(f"\nTop 20 short candidates (latest day):")
    top = latest.sort_values(ascending=False).head(20)
    for coin, score in top.items():
        print(f"  {coin:8s}: {score:.3f}")
