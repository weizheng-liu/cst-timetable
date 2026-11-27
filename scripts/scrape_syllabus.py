#!/usr/bin/env python3
"""Scrape the Nihon University CST public syllabus into data/courses.json.

Polite by design:
  * only the two public JSON endpoints are used (no login pages are touched)
  * >= 1 second between requests (--delay)
  * on-disk cache (.cache/syllabus) so re-runs don't re-download
  * bounded retries with backoff

Usage:
  python scripts/scrape_syllabus.py --year 2026 --dept 09           # 電子工学科 only
  python scripts/scrape_syllabus.py --year 2026 --dept all          # every department
  python scripts/scrape_syllabus.py --dept 09 --grade 2             # quick smoke test

Outputs:
  data/courses.json                      all courses (schema: data/schema/courses.schema.json)
  public/data/<year>/index.json          department list for the web app
  public/data/<year>/dept-<code>.json    per-department course file for the web app
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import syllabus_lib as lib  # noqa: E402

ROOT = lib.ROOT
CACHE_DIR = ROOT / ".cache" / "syllabus"
UA = "cst-timetable-bot/1.0 (+https://github.com/weizheng-liu/cst-timetable; unofficial course planner)"
ALLOWED_PREFIX = lib.BASE + "/syllabus/View/"


class Client:
    def __init__(self, delay: float = 1.2, retries: int = 3, use_cache: bool = True, cache_ttl_h: float = 24):
        self.delay = max(1.0, delay)  # never faster than 1 req/s
        self.retries = retries
        self.use_cache = use_cache
        self.cache_ttl = cache_ttl_h * 3600
        self._last = 0.0
        self.requests = 0
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def get_json(self, path: str) -> dict:
        url = lib.BASE + path
        if not url.startswith(ALLOWED_PREFIX):
            raise ValueError(f"refusing to fetch non-public endpoint: {url}")
        key = hashlib.sha1(url.encode()).hexdigest()
        cf = CACHE_DIR / f"{key}.json"
        if self.use_cache and cf.exists() and time.time() - cf.stat().st_mtime < self.cache_ttl:
            return json.loads(cf.read_text(encoding="utf-8"))
        last_err: Exception | None = None
        for attempt in range(self.retries + 1):
            wait = self.delay - (time.time() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()
            self.requests += 1
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=40) as r:
                    data = json.loads(r.read().decode("utf-8"))
                cf.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
                return data
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                last_err = e
                code = getattr(e, "code", None)
                if code in (400, 401, 403, 404):
                    break  # not retryable
                time.sleep(min(30, 3 * (2 ** attempt)))
        raise RuntimeError(f"GET {url} failed: {last_err}")


def scrape(year: str, depts: list[str], grade: int | None, client: Client, details: bool = True,
           log=print) -> dict:
    rules = lib.load_eval_rules()
    names = dict(lib.DEPARTMENTS + [lib.COMMON_DEPT])
    courses: dict[str, dict] = {}
    dept_members: dict[str, list[str]] = {}
    failures: list[str] = []

    for code in depts:
        idx = client.get_json(f"/syllabus/View/Index?setiNendo={year}&gakubu=1&gakka={code}")
        entries = lib.index_entries(idx)
        log(f"[{code} {names.get(code, '?')}] {len(entries)} syllabus pages")
        members: list[str] = []
        for e in entries:
            jks = e.get("jikwanaris") or []
            if not jks:
                continue
            if grade and str(jks[0].get("gakunen")) != str(grade):
                continue
            jcd = jks[0].get("jikanwariCD")
            members.append(jcd)
            if jcd in courses and courses[jcd]["hasDetail"]:
                # several syllabus pages share one 時間割CD (e.g. 卒業研究 per lab): merge teachers
                extra = [lib.clean(k.get("kyouinMei")).replace("\u3000", " ") for k in e.get("kyouins") or []]
                courses[jcd]["teachers"] = lib.tidy_teachers(courses[jcd]["teachers"] + extra)
                continue
            detail = None
            if details:
                pid = (e.get("page") or {}).get("pageID")
                try:
                    detail = client.get_json(
                        f"/syllabus/View/Course?setiNendo={year}&gakubu=1&jikanwariCD={jcd}&pageID={pid}&flag=")
                    if not (detail.get("courseViewData") or {}).get("syllabusData"):
                        detail = None
                        failures.append(jcd)
                except RuntimeError as err:
                    log(f"  ! {jcd}: {err}")
                    failures.append(jcd)
            courses[jcd] = lib.build_course(e, detail, year, rules)
        dept_members[code] = sorted(set(members))

    return {
        "meta": {
            "year": int(year),
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source": lib.BASE + "/syllabus/page/",
            "requests": client.requests,
            "detailFailures": sorted(set(failures)),
        },
        "departments": [
            {"code": c, "name": names.get(c, c), "courseIds": dept_members[c]} for c in depts
        ],
        "courses": sorted(courses.values(), key=lambda c: (c["department"] or "", c["grade"] or 0, c["id"])),
    }


def write_outputs(result: dict, merge: bool = True) -> None:
    out = ROOT / "data" / "courses.json"
    if merge and out.exists():
        # keep departments we did not re-scrape this time
        old = json.loads(out.read_text(encoding="utf-8"))
        if old.get("meta", {}).get("year") == result["meta"]["year"]:
            new_codes = {d["code"] for d in result["departments"]}
            keep_depts = [d for d in old["departments"] if d["code"] not in new_codes]
            new_ids = {c["id"] for c in result["courses"]}
            keep_ids = {i for d in keep_depts for i in d["courseIds"]} - new_ids
            result["courses"] += [c for c in old["courses"] if c["id"] in keep_ids]
            order = [c for c, _ in lib.DEPARTMENTS + [lib.COMMON_DEPT]]
            result["departments"] = sorted(keep_depts + result["departments"],
                                           key=lambda d: order.index(d["code"]) if d["code"] in order else 99)
            result["courses"].sort(key=lambda c: (c["department"] or "", c["grade"] or 0, c["id"]))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # split files for the web app (only load the department the user picks)
    year = result["meta"]["year"]
    pub = ROOT / "public" / "data" / str(year)
    pub.mkdir(parents=True, exist_ok=True)
    by_id = {c["id"]: c for c in result["courses"]}
    for d in result["departments"]:
        cs = [by_id[i] for i in d["courseIds"] if i in by_id]
        (pub / f"dept-{d['code']}.json").write_text(
            json.dumps({"year": year, "department": {"code": d["code"], "name": d["name"]}, "courses": cs},
                       ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (pub / "index.json").write_text(json.dumps({
        "year": year,
        "generatedAt": result["meta"]["generatedAt"],
        "departments": [{"code": d["code"], "name": d["name"], "count": len(d["courseIds"])}
                        for d in result["departments"] if d["code"] != lib.COMMON_DEPT[0]],
        # 共通・教養科目（gakka=99）。学科の選択肢には出さず、各学科の画面に「履修できる科目」として混ぜる
        "common": next(({"code": d["code"], "name": d["name"], "count": len(d["courseIds"])}
                        for d in result["departments"] if d["code"] == lib.COMMON_DEPT[0]), None),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "public" / "data" / "years.json").write_text(json.dumps({"latest": year}) + "\n", encoding="utf-8")


def dump_fixtures(client: Client, year: str, dept: str, jcds: list[str]) -> None:
    """Save trimmed raw API responses as unit-test fixtures (reads from cache)."""
    fx = ROOT / "tests" / "fixtures"
    fx.mkdir(parents=True, exist_ok=True)
    idx = client.get_json(f"/syllabus/View/Index?setiNendo={year}&gakubu=1&gakka={dept}")
    entries = [e for e in lib.index_entries(idx) if (e.get("jikanwariCD") or [""])[0] in jcds]
    idx["gakkaData"]["syllabusData"] = entries
    (fx / f"index_{dept}.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    for e in entries:
        jcd = e["jikanwariCD"][0]
        pid = e["page"]["pageID"]
        d = client.get_json(f"/syllabus/View/Course?setiNendo={year}&gakubu=1&jikanwariCD={jcd}&pageID={pid}&flag=")
        (fx / f"course_{jcd}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--year", default=None, help="開講年度 (default: April-based current academic year)")
    ap.add_argument("--dept", default="09", help="学科コード (e.g. 09) / comma list / 'all'")
    ap.add_argument("--grade", type=int, default=None, help="only this 学年 (for quick tests)")
    ap.add_argument("--delay", type=float, default=1.2, help="seconds between requests (min 1.0)")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--no-details", action="store_true", help="index only (no 授業計画)")
    ap.add_argument("--no-merge", action="store_true")
    ap.add_argument("--dump-fixtures", default=None,
                    help="comma list of 時間割CD whose raw API responses are saved to tests/fixtures/")
    a = ap.parse_args(argv)

    today = dt.date.today()
    year = a.year or str(today.year if today.month >= 4 else today.year - 1)
    depts = [c for c, _ in lib.DEPARTMENTS] + [lib.COMMON_DEPT[0]] if a.dept == "all" else a.dept.split(",")
    client = Client(delay=a.delay, use_cache=not a.no_cache)
    result = scrape(year, depts, a.grade, client, details=not a.no_details)
    write_outputs(result, merge=not a.no_merge)
    if a.dump_fixtures:
        dump_fixtures(client, year, depts[0], a.dump_fixtures.split(","))
    n = len(result["courses"])
    print(f"done: {n} courses, {client.requests} HTTP requests, {len(result['meta']['detailFailures'])} detail failures")
    return 0 if n else 1


if __name__ == "__main__":
    raise SystemExit(main())
