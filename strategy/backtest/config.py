"""Backtest configuration parameters."""
from dataclasses import dataclass


@dataclass
class BacktestConfig:
    # Portfolio
    initial_capital: float = 100_000.0
    n_shorts: int = 15            # Number of coins in short basket
    max_position_pct: float = 0.07  # Max single position as % of equity
    total_leverage: float = 1.5     # Total short exposure / equity

    # Timing
    rebalance_hours: int = 24     # Rebalance every N hours (24 = daily)
    momentum_window: int = 14     # Days for relative momentum calc
    funding_window: int = 7       # Days for funding rate average

    # Costs
    taker_fee: float = 0.00035    # 0.035% taker fee (HL)
    maker_fee: float = -0.00002   # -0.002% maker rebate (HL)
    use_maker: bool = False       # Whether to use maker fees (limit orders)
    slippage_bps: float = 2.0     # Slippage in basis points

    # Signal weights
    weight_momentum: float = 0.50
    weight_funding: float = 0.20
    weight_inflation: float = 0.30

    # Risk
    max_drawdown_stop: float = 0.25  # Stop trading if DD exceeds this
    min_daily_volume_usd: float = 1_000_000  # Min liquidity filter

    # Universe
    exclude_coins: tuple = ("BTC", "HYPE")  # Never short these

    @property
    def fee_rate(self) -> float:
        return self.maker_fee if self.use_maker else self.taker_fee

    @property
    def signal_weights(self) -> dict:
        return {
            "momentum": self.weight_momentum,
            "funding": self.weight_funding,
            "inflation": self.weight_inflation,
        }
