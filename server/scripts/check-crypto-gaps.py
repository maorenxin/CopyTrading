import sys
from pathlib import Path


def interval_to_ms(interval: str) -> int:
    try:
        value = int(interval[:-1])
    except Exception:
        return 0
    unit = interval[-1]
    if unit == "m":
        return value * 60 * 1000
    if unit == "h":
        return value * 60 * 60 * 1000
    if unit == "d":
        return value * 24 * 60 * 60 * 1000
    return 0


def parse_file_info(filename: str):
    if not filename.endswith(".csv"):
        return None
    base = filename[:-4]
    parts = base.split("_")
    if len(parts) < 3:
        return None
    source = parts[-1]
    if source not in {"binance", "hyperliquid"}:
        return None
    interval = parts[-2]
    if interval_to_ms(interval) <= 0:
        return None
    symbol_part = "_".join(parts[:-2]).upper()
    if symbol_part.endswith("_USDT"):
        symbol_part = symbol_part[:-5]
    elif symbol_part.endswith("USDT"):
        symbol_part = symbol_part[:-4]
    coin = symbol_part.replace("_", "")
    if not coin:
        return None
    return coin, interval, source


def load_times(csv_path: Path):
    try:
        content = csv_path.read_text(encoding="utf-8")
    except Exception:
        return []
    lines = content.splitlines()
    if len(lines) <= 1:
        return []
    times = []
    for line in lines[1:]:
        if not line:
            continue
        first = line.split(",", 1)[0].strip().strip('"')
        try:
            times.append(int(first))
        except Exception:
            continue
    return times


def find_gaps(times, interval_ms: int):
    if not times:
        return []
    uniq_times = sorted(set(times))
    gaps = []
    for idx in range(1, len(uniq_times)):
        prev_time = uniq_times[idx - 1]
        next_time = uniq_times[idx]
        diff = next_time - prev_time
        if diff > interval_ms:
            start = prev_time + interval_ms
            end = next_time - interval_ms
            missing = diff // interval_ms - 1
            gaps.append((start, end, missing, diff))
    return gaps


def main():
    root_dir = Path(__file__).resolve().parents[2]
    data_dir = root_dir / "crypto_data"
    if not data_dir.exists():
        print(f"crypto_data not found: {data_dir}", file=sys.stderr)
        sys.exit(1)

    print("file,coin,interval,gap_count,gap_index,gap_start,gap_end,missing_count,diff_ms")
    files_with_gaps = 0
    total_gaps = 0

    for csv_path in sorted(data_dir.glob("*.csv")):
        info = parse_file_info(csv_path.name)
        if not info:
            continue
        coin, interval, source = info
        interval_ms = interval_to_ms(interval)
        times = load_times(csv_path)
        gaps = find_gaps(times, interval_ms)
        if not gaps:
            continue
        files_with_gaps += 1
        total_gaps += len(gaps)
        gap_count = len(gaps)
        for gap_index, (start, end, missing, diff) in enumerate(gaps, 1):
            print(
                f"{csv_path.name},{coin},{interval},{gap_count},{gap_index},"
                f"{start},{end},{missing},{diff}"
            )

    print(f"TOTAL_FILES_WITH_GAPS={files_with_gaps}")
    print(f"TOTAL_GAPS={total_gaps}")


if __name__ == "__main__":
    main()
