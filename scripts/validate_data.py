#!/usr/bin/env python3
"""Validate data/courses.json and data/requirements/*.json.

Checks (beyond JSON Schema):
  * 時限 format: day 1..6, period 1..7, no duplicate slot inside one course
  * 単位数 is a positive number
  * no duplicate 時間割CD (course id)
  * every department courseId exists
  * sessions dates are valid ISO dates inside the academic year (Apr .. next Mar)
  * evaluation percentages are 0..100
  * requirements: group sums are consistent, required-course credits match the PDF total
Exit code 1 on any error. Warnings don't fail the build.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def validate_courses(data: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warns: list[str] = []
    year = data.get("meta", {}).get("year")
    seen: set[str] = set()
    for c in data.get("courses", []):
        cid = c.get("id")
        where = f"course {cid} ({c.get('name')})"
        if cid in seen:
            errors.append(f"duplicate 時間割CD: {cid}")
        seen.add(cid)
        cr = c.get("credits")
        if not isinstance(cr, (int, float)) or cr <= 0:
            errors.append(f"{where}: credits must be positive, got {cr!r}")
        slots = c.get("slots") or []
        keys = set()
        for s in slots:
            if not (1 <= s.get("day", 0) <= 6 and 1 <= s.get("period", 0) <= 7):
                errors.append(f"{where}: bad slot {s}")
            k = (s.get("day"), s.get("period"))
            if k in keys:
                errors.append(f"{where}: duplicate slot {s}")
            keys.add(k)
        if not slots:
            warns.append(f"{where}: no 曜日時限 (集中講義など)")
        for ss in c.get("sessions") or []:
            d = ss.get("date")
            if d is None:
                continue
            try:
                dd = dt.date.fromisoformat(d)
            except ValueError:
                errors.append(f"{where}: bad session date {d}")
                continue
            if year and not (dt.date(year, 3, 1) <= dd <= dt.date(year + 1, 3, 31)):
                warns.append(f"{where}: session date {d} outside academic year {year}")
        for p in (c.get("evaluation") or {}).get("parts", []):
            if not 0 <= p.get("percent", -1) <= 100:
                errors.append(f"{where}: evaluation percent out of range {p}")
        if c.get("grade") is None:
            warns.append(f"{where}: grade unknown")
    for d in data.get("departments", []):
        for i in d.get("courseIds", []):
            if i not in seen:
                errors.append(f"department {d.get('code')}: unknown course id {i}")
    return errors, warns


def validate_requirements(req: dict, name: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warns: list[str] = []
    groups = {g["id"]: g for g in req.get("groups", [])}
    top = [g for g in groups.values() if not g.get("parent")]
    s = sum(g["minCredits"] for g in top)
    if s > req.get("totalCredits", 0):
        errors.append(f"{name}: top-level group minimums ({s}) exceed totalCredits")
    for g in groups.values():
        if g.get("parent") and g["parent"] not in groups:
            errors.append(f"{name}: group {g['id']} has unknown parent {g['parent']}")
    for g in groups.values():
        if "requiredCredits" in g:
            got = sum(c["credits"] for c in req.get("courses", []) if c["required"] and in_group(c["group"], g["id"], groups))
            if got != g["requiredCredits"]:
                errors.append(f"{name}: group {g['id']} required credits {got} != PDF value {g['requiredCredits']}")
    names = [c["name"] for c in req.get("courses", [])]
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        errors.append(f"{name}: duplicate course names {sorted(dup)}")
    for c in req.get("courses", []):
        if c["group"] not in groups:
            errors.append(f"{name}: course {c['name']} in unknown group {c['group']}")
        if c["credits"] <= 0:
            errors.append(f"{name}: course {c['name']} credits must be positive")
    if req.get("verified") is not True:
        warns.append(f"{name}: verified=false (人手による確認待ち)")
    return errors, warns


def in_group(gid: str, target: str, groups: dict) -> bool:
    while gid:
        if gid == target:
            return True
        gid = groups.get(gid, {}).get("parent")
    return False


def schema_check(data: dict, schema_path: Path, label: str) -> list[str]:
    try:
        import jsonschema
    except ImportError:
        return []
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    v = jsonschema.Draft202012Validator(schema)
    return [f"{label}: schema: {'/'.join(map(str, e.path))}: {e.message}" for e in list(v.iter_errors(data))[:20]]


def main() -> int:
    errors: list[str] = []
    warns: list[str] = []
    cpath = ROOT / "data" / "courses.json"
    if cpath.exists():
        data = json.loads(cpath.read_text(encoding="utf-8"))
        errors += schema_check(data, ROOT / "data/schema/courses.schema.json", "courses.json")
        e, w = validate_courses(data)
        errors += e
        warns += w
        print(f"courses.json: {len(data.get('courses', []))} courses")
    else:
        warns.append("data/courses.json not found (run scripts/scrape_syllabus.py)")
    for p in sorted((ROOT / "data" / "requirements").glob("*.json")):
        req = json.loads(p.read_text(encoding="utf-8"))
        errors += schema_check(req, ROOT / "data/schema/requirements.schema.json", p.name)
        e, w = validate_requirements(req, p.name)
        errors += e
        warns += w
    for w in warns[:30]:
        print("WARN ", w)
    if len(warns) > 30:
        print(f"WARN  ... {len(warns) - 30} more warnings")
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} errors, {len(warns)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
