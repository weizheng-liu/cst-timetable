"""Parsing helpers for the Nihon University CST public syllabus JSON API.

The public syllabus site (https://www.kyoumu.cst.nihon-u.ac.jp/syllabus/page/)
is a Next.js app that reads two JSON endpoints, both public (no login):

  /syllabus/View/Index?setiNendo=YYYY&gakubu=1&gakka=NN
      -> list of syllabus pages for one department (科目一覧)
  /syllabus/View/Course?setiNendo=YYYY&gakubu=1&jikanwariCD=XXXX&pageID=N&flag=
      -> one syllabus page incl. 授業計画 (classScheduleData)

See docs/SYLLABUS_SITE.md for the investigation notes and code tables.
This module is pure (no network) so it can be unit tested with fixtures.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
EVAL_RULES_PATH = ROOT / "data" / "config" / "evaluation_rules.json"

BASE = "https://www.kyoumu.cst.nihon-u.ac.jp"
PUBLIC_COURSE_URL = BASE + "/syllabus/page/Publication/course/?setiNendo={year}&gakubu=1&jikanwariCD={jcd}&pageID={pid}"

# 学科コード -> 名称 (表示順は公式サイトの学科一覧に合わせる)
DEPARTMENTS: list[tuple[str, str]] = [
    ("01", "土木工学科"),
    ("02", "交通システム工学科"),
    ("03", "建築学科"),
    ("04", "海洋建築工学科"),
    ("14", "まちづくり工学科"),
    ("05", "機械工学科"),
    ("06", "精密機械工学科"),
    ("07", "航空宇宙工学科"),
    ("08", "電気工学科"),
    ("09", "電子工学科"),
    ("15", "応用情報工学科"),
    ("10", "物質応用化学科"),
    ("12", "物理学科"),
    ("13", "数学科"),
]

# youbiKbn: 2=月 ... 7=土  -> we store 1=月 ... 6=土
DAY_LABELS = {1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土"}

# risyukiKbn: tens digit 1=年間, 2=前期, 3=後期 (same rule as the official front-end)
TERM_BY_DIGIT = {1: "年間", 2: "前期", 3: "後期"}

# kamou.jugyouKbn (授業形態). Inferred from course names, see docs/SYLLABUS_SITE.md.
LECTURE_TYPES = {"K": "講義", "E": "演習", "J": "実験・実習", "Z": "講義及び演習", "G": "卒業研究"}

CAMPUS = {"F": "船橋", "S": "駿河台"}

ONLINE_METHOD = {1: "同時双方向", 2: "ハイフレックス", 3: "オンデマンド"}


def clean(s: Any) -> str:
    if s is None:
        return ""
    s = str(s).replace("\r\n", "\n").replace("\r", "\n")
    return s.strip()


def norm_name(s: str) -> str:
    """Normalise a course name for matching (NFKC, roman numerals, spaces)."""
    s = unicodedata.normalize("NFKC", s or "")
    # NFKC turns Ⅰ into I, Ⅱ into II ... keep that; also drop spaces
    s = re.sub(r"\s+", "", s)
    return s


def term_of(risyuki: str | None) -> str:
    try:
        return TERM_BY_DIGIT.get(int(risyuki) // 10, "不明")
    except (TypeError, ValueError):
        return "不明"


def day_of(youbi: str | None) -> int | None:
    try:
        d = int(youbi) - 1
    except (TypeError, ValueError):
        return None
    return d if d in DAY_LABELS else None


def parse_bikou(bikou: str) -> list[str]:
    """'{1}{未来}' -> ['1', '未来']"""
    return re.findall(r"\{([^}]*)\}", bikou or "")


def ymd(s: str | None) -> str | None:
    s = (s or "").strip()
    if re.fullmatch(r"\d{8}", s):
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return None


# ---------------------------------------------------------------- evaluation

def load_eval_rules(path: Path = EVAL_RULES_PATH) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


_PCT = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*[%％]")


def parse_evaluation(text: str, rules: dict) -> dict:
    """Split the free-text 成績評価 into (label, percent, category) parts and tags.

    Strategy: find every percentage; the label is the text immediately before it
    on the same line / clause. Each label is categorised by keyword rules from
    data/config/evaluation_rules.json (first matching category wins).
    """
    text = unicodedata.normalize("NFKC", clean(text))
    parts: list[dict] = []
    for m in _PCT.finditer(text):
        start = m.start()
        # label = text since previous delimiter
        prev = text[:start]
        cut = max(prev.rfind(ch) for ch in ["\n", "、", ",", "。", ";", "/", "+"])
        label = prev[cut + 1:]
        label = re.sub(r"[()（）\[\]【】:：=＝\s]+", " ", label).strip()
        label = re.sub(r"\d+(\.\d+)?$", "", label).strip()
        pct = float(m.group(1))
        if not label or pct > 100:
            continue
        parts.append({"label": label[:40], "percent": pct, "category": categorize(label, rules)})

    totals: dict[str, float] = {}
    for p in parts:
        totals[p["category"]] = totals.get(p["category"], 0) + p["percent"]

    tags = compute_tags(text, parts, totals, rules)
    return {"parts": parts, "totals": totals, "tags": tags}


def categorize(label: str, rules: dict) -> str:
    for cat in rules["categories"]:
        if any(re.search(k, label) for k in cat.get("exclude", [])):
            continue
        if any(re.search(k, label) for k in cat["keywords"]):
            return cat["id"]
    return "other"


def compute_tags(text: str, parts: list[dict], totals: dict, rules: dict) -> list[str]:
    tags = []
    for t in rules["tags"]:
        cond = t["when"]
        ok = True
        if "category_min" in cond:
            for cat, v in cond["category_min"].items():
                if totals.get(cat, 0) < v:
                    ok = False
        if "category_max" in cond:
            for cat, v in cond["category_max"].items():
                if totals.get(cat, 0) > v:
                    ok = False
        if cond.get("requires_parts") and not parts:
            ok = False
        if "text_absent" in cond and any(re.search(k, text) for k in cond["text_absent"]):
            ok = False
        if ok:
            tags.append(t["id"])
    return tags


# ---------------------------------------------------------------- courses

def index_entries(index_json: dict) -> list[dict]:
    return (index_json.get("gakkaData") or {}).get("syllabusData") or []


def slots_from_jikanwari(j: dict) -> list[dict]:
    """One 時間割 row -> list of {day, period}. renzokuJigen = number of consecutive periods."""
    day = day_of(j.get("youbiKbn"))
    try:
        start = int(j.get("jigen"))
    except (TypeError, ValueError):
        return []
    try:
        n = max(1, int(j.get("renzokuJigen") or 1))
    except ValueError:
        n = 1
    if day is None:
        return []
    return [{"day": day, "period": start + i} for i in range(n)]


def build_course(entry: dict, detail: dict | None, year: str, rules: dict) -> dict:
    """Merge one index entry (+ optional Course detail) into our course record."""
    page = entry.get("page") or {}
    kamou = entry.get("kamou") or {}
    jks = entry.get("jikwanaris") or []
    j0 = jks[0] if jks else {}

    sd = ((detail or {}).get("courseViewData") or {}).get("syllabusData") or {}
    dpage = sd.get("page") or page

    slots: list[dict] = []
    for j in jks:
        for s in slots_from_jikanwari(j):
            if s not in slots:
                slots.append(s)

    jcd = j0.get("jikanwariCD") or (entry.get("jikanwariCD") or [""])[0]
    tags_raw = parse_bikou(j0.get("bikou", ""))
    class_group = next((t for t in tags_raw if t.isdigit()), dpage.get("class") or None)

    evaluation_text = clean(dpage.get("evaluation"))
    ev = parse_evaluation(evaluation_text, rules)

    teachers = [clean(k.get("kyouinMei")).replace("　", " ") for k in (entry.get("kyouins") or [])]

    sessions = []
    default_dates = ((detail or {}).get("courseViewData") or {}).get("defaultScheduledDates") or []
    regular_count = (sd.get("formatData") or {}).get("regularCount")
    for row in sd.get("classScheduleData") or []:
        cs = row.get("classSchedule") or {}
        cat = cs.get("category")
        start = ymd(cs.get("startDate"))
        idx = cs.get("displayIndex")
        if (not start and cat == 1 and dpage.get("comprehensionTest") == 1
                and idx == regular_count):
            # 理解度確認テスト: date comes from the faculty-wide default schedule
            for d in default_dates:
                if d.get("category") == 1 and d.get("displayIndex") == idx:
                    start = ymd(str(d.get("scheduledDate1") or "")[:10].replace("-", ""))
        content = clean(cs.get("content"))
        mode = "ondemand" if cs.get("isOnline") == 2 else "face"
        if dpage.get("classFormat") == 2 and mode == "face":
            mode = "online"
        sessions.append({
            "no": idx,
            "kind": "regular" if cat == 1 else "ondemand",
            "date": start,
            "endDate": ymd(cs.get("endDate")),
            "mode": mode,
            "content": content,
            "cancelled": bool(re.search(r"休講", content)),
        })
    sessions.sort(key=lambda s: (s["kind"] != "regular", s["no"] or 0))

    texts = []
    for t in sd.get("texts") or []:
        name = clean(t.get("name"))
        if name:
            texts.append({k: clean(t.get(k)) for k in ("name", "author", "publisher", "publicationYear")})

    class_format = "オンライン" if dpage.get("classFormat") == 2 else "対面"

    return {
        "id": jcd,
        "pageId": page.get("pageID"),
        "code": kamou.get("kamokuCD") or j0.get("setiKamokuCD"),
        "name": clean(kamou.get("kamokuMei")),
        "subtitle": clean(page.get("subtitle")),
        "teachers": teachers,
        "department": j0.get("setiGakkaCD") or page.get("setiGakkaCD"),
        "syllabusDepartment": page.get("syllabusSetiGakkaCD"),
        "grade": int(j0["gakunen"]) if str(j0.get("gakunen", "")).isdigit() else None,
        "term": term_of(j0.get("risyukiKbn")),
        "termCode": j0.get("risyukiKbn"),
        "slots": slots,
        "credits": kamou.get("taniSu"),
        "lectureType": LECTURE_TYPES.get(kamou.get("jugyouKbn") or "", kamou.get("jugyouKbn")),
        "classGroup": class_group,
        "notes": [t for t in tags_raw if not t.isdigit()],
        "campus": CAMPUS.get(j0.get("kousyaCD") or "", j0.get("kousyaCD")),
        "room": j0.get("kyousituNo") or None,
        "classFormat": class_format,
        "onlineMethod": ONLINE_METHOD.get(dpage.get("onlineMethod")) if class_format == "オンライン" else None,
        "objectives": clean(dpage.get("courseObjectives")),
        "lectureForm": clean(dpage.get("lectureForm")),
        "evaluation": {"text": evaluation_text, **ev},
        "textbooks": texts,
        "sessions": sessions,
        "hasDetail": detail is not None,
        "url": PUBLIC_COURSE_URL.format(year=year, jcd=jcd, pid=page.get("pageID")),
    }
