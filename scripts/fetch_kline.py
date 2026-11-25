#!/usr/bin/env python3
"""抓取个股日K线切片，输出到 public/data/trades-kline/{date}-{code}.json

数据源：腾讯行情接口（免鉴权）。用法：
    python3 scripts/fetch_kline.py                 # 扫描所有复盘文章里的 trades 自动抓取
    python3 scripts/fetch_kline.py 600519 000001   # 手动指定代码（窗口取数据末尾）
"""

import bisect
import json
import re
import ssl
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "data" / "trades-kline"
LOGS_DIR = ROOT / "src" / "content" / "logs"
WINDOW = 20  # 交易日前后各20天
FETCH_COUNT = 120

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---", re.S)


def market_prefix(code: str) -> str:
    return "sh" if code.startswith(("5", "6", "9")) else "sz"


def fetch_bars(code: str) -> list[dict]:
    symbol = f"{market_prefix(code)}{code}"
    url = (
        "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
        f"?param={symbol},day,,,{FETCH_COUNT},qfq"
    )
    # 本机走代理时证书链常被拦截，行情数据是公开只读接口，直接放行证书校验
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(url, headers={"User-Agent": "fupan-kline/1.0"})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    node = payload["data"][symbol]
    rows = node.get("qfqday") or node.get("day") or []
    bars = []
    for r in rows:
        # [date, open, close, high, low, volume, ...]
        bars.append(
            {
                "date": r[0],
                "open": float(r[1]),
                "close": float(r[2]),
                "high": float(r[3]),
                "low": float(r[4]),
                "volume": float(r[5]),
            }
        )
    return bars


def slice_window(bars: list[dict], target: str | None) -> list[dict]:
    if target is None:
        return bars[-(WINDOW * 2 + 1) :]
    dates = [b["date"] for b in bars]
    if target in dates:
        i = dates.index(target)
    else:
        # 目标日期不在数据里（节假日/数据未更新），取最近的交易日
        i = min(range(len(dates)), key=lambda j: abs(j - bisect.bisect_left(dates, target)))
    lo = max(0, i - WINDOW)
    hi = min(len(bars), i + WINDOW + 1)
    return bars[lo:hi]


def collect_targets() -> list[tuple[str, str]]:
    """从所有复盘文章里提取 (code, date) 交易切片需求"""
    targets = set()
    for path in LOGS_DIR.glob("*.md*"):
        text = path.read_text(encoding="utf-8")
        m = FRONTMATTER_RE.match(text)
        if not m:
            continue
        fm = m.group(1)
        dm = re.search(r"^date:\s*(\d{4}-\d{2}-\d{2})", fm, re.M)
        if not dm:
            continue
        day = dm.group(1)
        for cm in re.finditer(r'code:\s*"(\d{6})"', fm):
            targets.add((cm.group(1), day))
    return sorted(targets)


def main() -> int:
    if len(sys.argv) > 1:
        jobs = [(c, None) for c in sys.argv[1:]]
    else:
        jobs = collect_targets()
        if not jobs:
            print("没有在复盘文章里找到 trades，退出。")
            return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cache: dict[str, list[dict]] = {}
    ok = fail = 0
    for code, day in jobs:
        try:
            if code not in cache:
                cache[code] = fetch_bars(code)
            bars = slice_window(cache[code], day)
            name = f"{day}-{code}.json" if day else f"latest-{code}.json"
            (OUT_DIR / name).write_text(
                json.dumps(bars, ensure_ascii=False), encoding="utf-8"
            )
            print(f"OK  {name}  ({len(bars)} 根K线)")
            ok += 1
        except Exception as e:  # 网络/接口异常直接报出来，别静默吞
            print(f"FAIL {code} {day}: {e}", file=sys.stderr)
            fail += 1
    print(f"完成：成功 {ok}，失败 {fail}")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
