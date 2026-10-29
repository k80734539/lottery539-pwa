#!/usr/bin/env python3
"""從台灣彩券官網端點更新 data/results.json（只追加 history.json 之後的開獎）。

官網端點不是正式公開 API，格式變動時本腳本會拒絕寫入並以非零代碼結束。
僅使用標準函式庫。用法： python scripts/update_results.py [--months 2] [--since-month YYYY-MM]
"""
from __future__ import annotations
import argparse, json, sys, time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib import error, parse, request

API = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result"
ROOT = Path(__file__).resolve().parent.parent
HISTORY = ROOT / "data" / "history.json"
RESULTS = ROOT / "data" / "results.json"
TZ = timezone(timedelta(hours=8))


def compact_issue(period) -> str:
    t = str(period).strip()
    return f"{t[:3]}{t[-3:]}" if len(t) == 9 and t.isdigit() else t


def fetch_month(month: str, retries: int = 3) -> list[dict]:
    q = parse.urlencode({"month": month, "pageSize": 100})
    req = request.Request(f"{API}?{q}", headers={
        "Accept": "application/json", "User-Agent": "lottery539-pwa-updater/1.0"})
    last = None
    for i in range(retries):
        try:
            with request.urlopen(req, timeout=20) as r:
                payload = json.loads(r.read().decode("utf-8"))
            if int(payload.get("rtCode", -1)) != 0:
                raise RuntimeError(f"rtCode={payload.get('rtCode')}")
            rows = (payload.get("content") or {}).get("daily539Res") or []
            if not isinstance(rows, list):
                raise RuntimeError("daily539Res 不是陣列")
            return rows
        except (error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as e:
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"讀取 {month} 失敗：{last}")


def convert(item: dict) -> dict:
    nums = item.get("drawNumberSize") or item.get("drawNumberAppear") or []
    nums = sorted(int(n) for n in nums)
    if len(nums) != 5 or len(set(nums)) != 5 or not all(1 <= n <= 39 for n in nums):
        raise ValueError(f"號碼格式異常：{item.get('period')} {nums}")
    date = str(item.get("lotteryDate", ""))[:10]
    datetime.strptime(date, "%Y-%m-%d")
    return {"issue": compact_issue(item.get("period", "")), "date": date, "numbers": nums}


def month_keys(start: str | None, count: int) -> list[str]:
    now = datetime.now(TZ)
    y, m = now.year, now.month
    keys = []
    while True:
        keys.append(f"{y:04d}-{m:02d}")
        if start and keys[-1] <= start:
            break
        if not start and len(keys) >= count:
            break
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        if len(keys) > 60:
            break
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=2)
    ap.add_argument("--since-month")
    a = ap.parse_args()

    history = json.loads(HISTORY.read_text(encoding="utf-8"))
    last_hist_date = max(d[1] for d in history["draws"])
    hist_issues = {d[0] for d in history["draws"]}
    current = {}
    if RESULTS.exists():
        for d in json.loads(RESULTS.read_text(encoding="utf-8")).get("draws", []):
            current[d["date"]] = d

    today = datetime.now(TZ).strftime("%Y-%m-%d")
    added = conflicts = 0
    for month in month_keys(a.since_month, a.months):
        for item in fetch_month(month):
            d = convert(item)
            if d["date"] <= last_hist_date or d["issue"] in hist_issues or d["date"] > today:
                continue
            old = current.get(d["date"])
            if old:
                if old["numbers"] != d["numbers"] or old["issue"] != d["issue"]:
                    conflicts += 1
                    print(f"衝突（保留舊值）：{old} vs {d}", file=sys.stderr)
                continue
            current[d["date"]] = d
            added += 1
    draws = sorted(current.values(), key=lambda x: x["date"], reverse=True)
    out = {
        "source": API,
        "note": "官方內部端點資料；僅供紀錄對獎，請以台灣彩券公告為準。",
        "updated": datetime.now(TZ).isoformat(timespec="seconds"),
        "latestDate": draws[0]["date"] if draws else None,
        "draws": draws,
    }
    old_text = RESULTS.read_text(encoding="utf-8") if RESULTS.exists() else ""
    try:
        old_obj = json.loads(old_text) if old_text else {}
    except json.JSONDecodeError:
        old_obj = {}
    if old_obj.get("draws") == draws:
        print(f"沒有新開獎（最新 {out['latestDate']}）。")
        return 0
    RESULTS.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"新增 {added} 期，衝突 {conflicts}，最新 {out['latestDate']}。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa
        print(f"更新失敗：{e}", file=sys.stderr)
        sys.exit(1)
