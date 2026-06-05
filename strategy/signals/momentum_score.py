"""Relative momentum signal: coins underperforming BTC get high short scores."""
import pandas as pd
import numpy as np


def compute_relative_returns(closes: pd.DataFrame, window: int = 14) -> pd.DataFrame:
    """Compute N-day returns relative to BTC for all coins.

    Returns: DataFrame where negative values = underperforming BTC.
    """
    if "BTC" not in closes.columns:
        raise ValueError("BTC must be in the universe for relative momentum")

    # Compute rolling returns
    returns = closes.pct_change(window, fill_method=None)
    btc_returns = returns["BTC"]

    # Relative return = coin return - BTC return
    relative = returns.sub(btc_returns, axis=0)
    return relative


def momentum_score(closes: pd.DataFrame, window: int = 14) -> pd.Series:
    """Score each coin: more negative relative return = higher short score.

    Returns latest score for each coin (0 to 1 scale, 1 = strongest short).
    """
    relative = compute_relative_returns(closes, window)

    # Take the latest row
    latest = relative.iloc[-1].drop("BTC", errors="ignore")

    # Normalize to 0-1: most negative → 1, most positive → 0
    min_val = latest.min()
    max_val = latest.max()
    if max_val == min_val:
        return pd.Series(0.5, index=latest.index)

    # Invert: lower relative return → higher score
    score = (max_val - latest) / (max_val - min_val)
    return score.clip(0, 1)


def rolling_momentum_scores(closes: pd.DataFrame, window: int = 14) -> pd.DataFrame:
    """Compute momentum scores for every day (for backtesting).

    Returns: DataFrame with same index as closes, values are short scores.
    """
    relative = compute_relative_returns(closes, window)
    relative = relative.drop(columns=["BTC"], errors="ignore")

    # Rank-normalize each row to 0-1
    def row_rank_normalize(row):
        valid = row.dropna()
        if len(valid) < 5:
            return pd.Series(0.0, index=row.index)
        ranked = valid.rank(ascending=True)  # lowest return → lowest rank
        rng = ranked.max() - ranked.min()
        if rng == 0:
            return pd.Series(0.0, index=row.index)
        normalized = (ranked.max() - ranked) / rng
        # Fill back into full row (NaN coins get 0)
        result = pd.Series(0.0, index=row.index)
        result[normalized.index] = normalized.values
        return result

    scores = relative.apply(row_rank_normalize, axis=1)
    return scores


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(__file__).rsplit("/", 1)[0] + "/../data")
    from price_loader import load_universe, get_daily_closes

    universe = load_universe(min_days=180)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")

    scores = momentum_score(closes, window=14)
    print(f"\nTop 15 short candidates (14d momentum):")
    top = scores.sort_values(ascending=False).head(15)
    for coin, score in top.items():
        ret = compute_relative_returns(closes, 14).iloc[-1].get(coin, 0)
        print(f"  {coin:8s}: score={score:.3f}, relative_return={ret:+.2%}")
