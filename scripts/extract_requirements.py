#!/usr/bin/env python3
"""Extract 卒業要件 (graduation requirements) for one 学科 from the 学部要覧 PDF.

Source (2025年度入学): https://www.cst.nihon-u.ac.jp/about/education/pdf/0_3_1_r7.pdf

For each department the 学部要覧 has two consecutive pages:
  * 「<学科名> 卒業条件等」   – 卒業研究着手条件 + 卒業条件 table (min credits per 科目区分)
  * 「<学科名> 授業科目配置表」 – every course with credits, 設置年次 and 必修 (grey cells)

Page 1 is parsed from its text with regular expressions.
Page 2 is parsed geometrically: table borders give the 科目区分 bands, column borders
give 設置年次, grey filled rectangles mark 必修 rows.

The output is ALWAYS written with "verified": false; docs/REQUIREMENTS_REVIEW.md lists
every extracted rule with its PDF page so a human can check it.

Usage:
  python scripts/extract_requirements.py --pdf youran.pdf --entry-year 2025 --dept 09
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from syllabus_lib import DEPARTMENTS  # noqa: E402

SLUGS = {
    "01": "civil", "02": "transportation", "03": "architecture", "04": "oceanic-architecture",
    "14": "urban", "05": "mechanical", "06": "precision", "07": "aerospace", "08": "electrical",
    "09": "electronics", "15": "applied-informatics", "10": "materials-chemistry", "12": "physics", "13": "mathematics",
}

KANSUJI = str.maketrans("０１２３４５６７８９", "0123456789")


def nf(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "").translate(KANSUJI)


def decode_cid(s: str) -> str:
    """Some numbers in the PDF use a subset font: (cid:N) -> chr(N + 29)."""
    return re.sub(r"\(cid:(\d+)\)", lambda m: chr(int(m.group(1)) + 29), s)


# ------------------------------------------------------------------ locate pages

def side_tab(page) -> str:
    """Text of the vertical index tab printed in the page margin, e.g. '電子工学科卒業条件等'."""
    cs = [c for c in page.chars if c["x0"] < 40 or c["x1"] > page.width - 40]
    cs.sort(key=lambda c: (round(c["x0"] / 10), c["top"]))
    return "".join(c["text"] for c in cs).replace(" ", "")


def find_pages(pdf, dept_name: str) -> tuple[int, int]:
    """Return 0-based indexes of the 卒業条件等 page and the 授業科目配置表 page (found via the margin tab)."""
    cond = table = None
    for i, page in enumerate(pdf.pages):
        tab = re.sub(r"^[、。，．,.「」『』\s]+", "", side_tab(page))  # 余白の見出しの前に句読点が混ざることがある
        if not tab.startswith(dept_name):
            continue
        if cond is None and "卒業条件" in tab:
            cond = i
        elif table is None and "授業科目配置表" in tab:
            table = i
        if cond is not None and table is not None:
            break
    if cond is None or table is None:
        # 見つからないときは、余白の見出しを全部出して原因を追えるようにする
        for i, page in enumerate(pdf.pages):
            tab = side_tab(page)
            if "卒業条件" in tab or "配置表" in tab:
                print(f"  p.{i + 1}: {tab[:60]!r}")
        raise SystemExit(f"could not find requirement pages for {dept_name}")
    return cond, table


def printed_page_no(page) -> int | None:
    words = [w for w in page.extract_words() if w["top"] > page.height - 40 and re.fullmatch(r"\d{1,3}", w["text"])]
    return int(words[0]["text"]) if words else None


# ------------------------------------------------------------------ page 1: rules

def parse_conditions(text: str, page_no: int) -> dict:
    t = nf(text)
    flat = re.sub(r"\s+", "", t)
    # NFKC turns ①②③ into 1 2 3, so keep a variant with the circled numbers for the choice rules
    flat_raw = re.sub(r"\s+", "", unicodedata.normalize("NFKC", re.sub(r"[①-⑳]", lambda m: f"<{ord(m.group(0)) - 0x245F}>", text)).translate(KANSUJI))
    out: dict = {"thesis": [], "groups": [], "choices": []}

    def num(pattern: str, src: str = flat) -> int | None:
        m = re.search(pattern, src)
        return int(m.group(1)) if m else None

    yrs = num(r"修業年数が(\d+)年以上")
    if yrs:
        out["thesis"].append({"rule": f"修業年数が{yrs}年以上", "years": yrs, "page": page_no})
    tot = num(r"卒業に必要な単位から(\d+)単位以上")
    if tot:
        out["thesis"].append({"rule": f"卒業に必要な単位から{tot}単位以上を修得", "minCredits": tot, "page": page_no})
    maj = num(r"専門教育科目から(\d+)単位以上")
    if maj:
        out["thesis"].append({"rule": f"専門教育科目から{maj}単位以上を修得", "minCredits": maj, "group": "major", "page": page_no})
    m = re.search(r"(\d)年次までに設置された専門教育科目の必修科目をすべて修得", flat)
    if m:
        out["thesis"].append({"rule": m.group(0), "requiredUpToYear": int(m.group(1)), "group": "major", "page": page_no})
    # そのほかの着手条件（特定科目の修得など）は文のまま残す（表示と確認用）
    sec = flat.split("卒業研究着手条件", 1)[-1].split("卒業条件", 1)[0]
    for m in re.finditer(r"\((\d)\)(.+?)こと。", sec):
        body = m.group(2)
        if re.search(r"修業年数|卒業に必要な単位から|専門教育科目から\d+単位|年次までに設置された", body):
            continue
        out["thesis"].append({"rule": re.sub(r"(して)?いる$", "", body), "page": page_no})

    g = out["groups"]
    v = num(r"全学共通教育科目必修(\d+)単位")
    if v is not None:
        g.append({"id": "common", "label": "全学共通教育科目", "minCredits": num(r"全学共通教育科目必修\d+単位(\d+)単位") or v, "requiredCredits": v})
    lib_total = num(r"教養教育科目(\d+)単位以上")
    if lib_total is not None:
        g.append({"id": "liberal", "label": "教養教育科目", "minCredits": lib_total})
    for gid, pat, label in [
        ("liberal.g1", r"「多文化と社会の理解」\(I群\)(\d+)単位以上", "多文化と社会の理解（Ⅰ群）"),
        ("liberal.g2", r"「心と身体の表現」\(II群\)(\d+)単位以上", "心と身体の表現（Ⅱ群）"),
        ("liberal.g3", r"「科学・技術のリテラシー」\(III群\)(\d+)単位以上", "科学・技術のリテラシー（Ⅲ群）"),
    ]:
        vv = num(pat)
        if vv is not None:
            g.append({"id": gid, "label": label, "parent": "liberal", "minCredits": vv})
    if "「総合・ゼミナール」(IV群)" in flat:
        g.append({"id": "liberal.g4", "label": "総合・ゼミナール（Ⅳ群）", "parent": "liberal", "minCredits": 0,
                  "note": "区分ごとの最低単位なし（教養教育科目の合計に算入）"})

    basic_total = num(r"基礎教育科目(\d+)単位以上")
    if basic_total is not None:
        g.append({"id": "basic", "label": "基礎教育科目", "minCredits": basic_total})
    gm = re.search(r"「グローバルスキル分野」(.*?)基礎教育科目", flat_raw)
    if gm:
        blk = gm.group(1)
        req = num(r"<1>必修(\d+)単位", blk)
        gl_total = num(r"(\d+)単位以上(?!.*\d+単位以上.*から)", blk)
        tm = re.search(r"(\d+)単位以上English", blk)
        gl_total = int(tm.group(1)) if tm else gl_total
        g.append({"id": "basic.global", "label": "グローバルスキル分野", "parent": "basic", "minCredits": gl_total or 0,
                  **({"requiredCredits": req} if req is not None else {})})
        for mark, names, n in re.findall(r"<([2-9])>(.+?)から(\d+)単位以上", blk):
            names = re.sub(r"\d+単位以上", "", names)
            out["choices"].append({
                "id": f"basic.global.{chr(ord('a') + int(mark) - 2)}",
                "label": f"グローバルスキル分野 {'①②③④⑤⑥⑦⑧⑨'[int(mark) - 1]}",
                "courses": [x for x in re.split(r"[,，、]", names) if x],
                "minCredits": int(n),
                "page": page_no,
            })
    sm = re.search(r"「基礎科学分野」(.*?)(専門教育科目|$)", flat)
    if sm:
        blk = sm.group(1)
        nums = [int(x) for x in re.findall(r"(\d+)単位以上", blk)]
        sci_total = max(nums) if nums else 0  # 分野全体の最低単位は各系より大きい
        g.append({"id": "basic.science", "label": "基礎科学分野", "parent": "basic", "minCredits": sci_total})
        for gid, key, label in [("basic.science.math", "数学系", "数学系"), ("basic.science.physics", "物理学系", "物理学系"), ("basic.science.chem", "化学系", "化学系")]:
            vv = num(key + r":(?:必修を含めて)?(\d+)単位以上", blk)
            if vv is not None:
                g.append({"id": gid, "label": label, "parent": "basic.science", "minCredits": vv})

    mm = re.search(r"専門教育科目必修(\d+)単位を含めて(\d+)単位以上", flat)
    if mm:
        g.append({"id": "major", "label": "専門教育科目", "minCredits": int(mm.group(2)), "requiredCredits": int(mm.group(1))})
    else:
        # 例（精密機械）：①必修20単位 ②「基礎系列」から8単位以上 … 専門教育科目 86単位以上
        mt = num(r"専門教育科目(\d+)単位以上")
        blk = flat_raw.split("化学系", 1)[-1].split("合計単位数", 1)[0]
        mr = num(r"<1>必修(\d+)単位", blk)
        if mt is not None:
            g.append({"id": "major", "label": "専門教育科目", "minCredits": mt, **({"requiredCredits": mr} if mr is not None else {})})
        for mark, series, n in re.findall(r"<([2-9])>「([^」]+系列)」から(\d+)単位以上", blk):
            sid = series_id(series)
            g.append({"id": sid, "label": series, "parent": "major", "minCredits": int(n)})
            out["choices"].append({"id": sid, "label": f"専門 {series}", "courses": [], "group": sid, "minCredits": int(n), "page": page_no})
    out["total"] = num(r"合計単位数(\d+)単位以上")
    for x in g:
        x["page"] = page_no
        x.setdefault("parent", None)
    return out


# ------------------------------------------------------------------ page 2: course table

def _chars_label(page, x0: float, x1: float, top: float, bottom: float) -> str:
    cs = [c for c in page.chars if x0 <= c["x0"] < x1 and top <= c["top"] < bottom]
    # vertical Japanese: columns right-to-left, each column top-to-bottom; horizontal text also works
    vert = sorted(cs, key=lambda c: (-round(c["x0"] / 4), c["top"]))
    horiz = sorted(cs, key=lambda c: (round(c["top"] / 4), c["x0"]))
    j = lambda xs: nf("".join(c["text"] for c in xs)).replace(" ", "")
    return j(horiz) + "|" + j(vert)


def _hlines(page, x_start: float, tol: float = 2.5) -> list[float]:
    ys = sorted({round(e["top"], 0) for e in page.edges
                 if e["orientation"] == "h" and abs(e["x0"] - x_start) < tol and e["x1"] - e["x0"] > 300})
    merged: list[float] = []
    for y in ys:
        if not merged or y - merged[-1] > 2:
            merged.append(y)
    return merged


def _bands(lines: list[float]) -> list[tuple[float, float]]:
    return [(a, b) for a, b in zip(lines, lines[1:]) if b - a > 3]


SERIES_IDS = {"基礎系列": "basic", "力学系列": "mechanics", "電気系列": "electric", "計測・制御系列": "control", "機械系列": "machine",
              "材料系列": "materials", "情報系列": "info", "設計系列": "design", "エネルギー系列": "energy"}


def series_id(label: str) -> str:
    """「力学系列」→ major.series.mechanics。知らない系列は番号付き"""
    lab = nf(label).replace(" ", "")
    for k, v in SERIES_IDS.items():
        if nf(k) == lab:
            return f"major.series.{v}"
    return "major.series.s" + str(abs(hash(lab)) % 1000)


GROUP_KEYWORDS = [
    ("common", ["全学共通"]),
    ("liberal.g1", ["多文化", "(I群)"]),
    ("liberal.g2", ["心と身体", "(II群)"]),
    ("liberal.g3", ["リテラシ", "(III群)"]),
    ("liberal.g4", ["総合・ゼミ", "(IV群)"]),
    ("basic.global", ["グローバル"]),
    ("basic.science.math", ["数学系"]),
    ("basic.science.physics", ["物理学系"]),
    ("basic.science.chem", ["化学系"]),
    ("basic.science", ["基礎科学"]),
    ("liberal", ["教養"]),
    ("major", ["専門"]),
    ("basic", ["基礎教育"]),
]


def classify_label(label: str) -> str | None:
    for part in label.split("|"):
        m = re.search(r"([^|]{1,8}系列)", part)
        if m and "系列" in part:
            for k in SERIES_IDS:
                if nf(k) in part:
                    return series_id(k)
    for gid, kws in GROUP_KEYWORDS:
        if any(k in label for k in kws):
            return gid
    return None


def parse_table(page, page_no: int) -> list[dict]:
    words = page.extract_words()
    # year columns from the header "1年次" … "4年次"
    heads = sorted((w for w in words if re.fullmatch(r"[1-4１-４]年次", w["text"])), key=lambda w: w["x0"])
    col_left = min((w["x0"] for w in heads), default=150) - 50
    # vertical borders of the year columns
    vx = sorted({round(e["x0"]) for e in page.edges if e["orientation"] == "v" and e["x0"] >= col_left - 5 and e["bottom"] - e["top"] > 5})
    year_edges: list[float] = []
    for x in vx:
        if not year_edges or x - year_edges[-1] > 30:
            year_edges.append(x)
    body_x0 = year_edges[0] if year_edges else col_left

    def year_of(x: float) -> int:
        for i, (a, b) in enumerate(zip(year_edges, year_edges[1:])):
            if a - 1 <= x < b:
                return i + 1
        return 1

    # table frame: horizontal lines starting at the outer left edge (top level), the 2nd column, the 3rd column
    left_xs = sorted({round(e["x0"]) for e in page.edges if e["orientation"] == "h" and e["x1"] - e["x0"] > 300 and e["x0"] < body_x0})
    levels = []
    for x in left_xs:
        if not levels or x - levels[-1] > 15:
            levels.append(x)
    levels = levels[:4]
    lvl_lines = [_hlines(page, x) for x in levels]
    top_lines = lvl_lines[0]
    header_bottom = max((w["bottom"] for w in heads), default=top_lines[0])
    table_top, table_bottom = header_bottom + 1, top_lines[-1]

    # build nested bands: each y-range gets the most specific recognised group label
    def group_at(y: float) -> str | None:
        best = None
        for li, lines in enumerate(lvl_lines):
            # a band at this level is bounded by lines of this level OR any shallower level
            bounds = sorted(set(lines) | {v for lj in range(li) for v in lvl_lines[lj]})
            for a, b in _bands(bounds):
                if a <= y < b:
                    x0 = levels[li]
                    x1 = levels[li + 1] if li + 1 < len(levels) else body_x0
                    gid = classify_label(_chars_label(page, x0, x1, a, b))
                    if gid:
                        best = gid
        return best

    grey = [r for r in page.rects if r.get("fill") and _is_grey(r.get("non_stroking_color")) and r["x1"] - r["x0"] > 200]

    def required_at(y: float) -> bool:
        return any(r["top"] - 1 <= y <= r["bottom"] + 1 for r in grey)

    # rebuild text lines from chars inside the body
    chars = [c for c in page.chars if c["x0"] >= body_x0 - 1 and table_top < c["top"] < table_bottom]
    rows: list[list] = []
    for c in sorted(chars, key=lambda c: c["top"]):
        if rows and c["top"] - rows[-1][0]["top"] <= 2.5:
            rows[-1].append(c)
        else:
            rows.append([c])
    courses: list[dict] = []
    for cs in rows:
        cs.sort(key=lambda c: c["x0"])
        text, xs = "", []
        for c in cs:
            t = decode_cid(c["text"])
            text += t
            xs.extend([c["x0"]] * len(t))
        text_n = text
        for m in re.finditer(r"([^()\s（）][^()（）]*?)\s*[(（](\d+)[)）]", text_n):
            name = nf(m.group(1)).strip()
            if not name or len(name) > 30:
                continue
            x = xs[m.start(1)]
            y = cs[0]["top"] + 3
            courses.append({
                "name": name,
                "credits": int(m.group(2)),
                "year": year_of(x),
                "required": required_at(y),
                "group": group_at(y),
                "page": page_no,
            })
    return courses


def _is_grey(c) -> bool:
    if c is None:
        return False
    if isinstance(c, (int, float)):
        return 0.05 < float(c) < 0.95 and float(c) != 1.0
    if isinstance(c, (list, tuple)):
        if len(c) == 1:
            return 0.05 < c[0] < 0.95
        if len(c) == 3:
            return max(c) - min(c) < 0.05 and 0.05 < c[0] < 0.95
    return False


# ------------------------------------------------------------------ main

def extract(pdf_path: str, dept: str, entry_year: int, pdf_url: str, page_offset: int = 0) -> dict:
    import pdfplumber

    name = dict(DEPARTMENTS)[dept]
    with pdfplumber.open(pdf_path) as pdf:
        ci, ti = find_pages(pdf, name)
        cpage, tpage = pdf.pages[ci], pdf.pages[ti]
        ci, ti = ci + page_offset, ti + page_offset
        cond = parse_conditions(cpage.crop((40, 0, cpage.width - 40, cpage.height)).extract_text() or "", ci + 1)  # 余白の見出しを除く
        courses = parse_table(tpage, ti + 1)
        printed = [printed_page_no(cpage), printed_page_no(tpage)]

    # 系列の選択必修は配置表の区分から科目を集める
    for ch in cond["choices"]:
        if ch.get("group"):
            ch["courses"] = [c["name"] for c in courses if c["group"] == ch["group"]]
            del ch["group"]
    # choice rules reference course names; mark courses that belong to one
    for ch in cond["choices"]:
        for c in courses:
            if nf(c["name"]).replace(" ", "") in [nf(x).replace(" ", "") for x in ch["courses"]]:
                c["choice"] = ch["id"]

    return {
        "entryYear": entry_year,
        "department": {"code": dept, "name": name},
        "verified": False,
        "source": {"url": pdf_url, "title": f"令和{entry_year - 2018}年度 理工学部 学部要覧", "pages": [ci + 1, ti + 1], "printedPages": printed},
        "totalCredits": cond.get("total") or 0,
        "groups": cond["groups"],
        "choiceRules": cond["choices"],
        "thesisPrerequisites": cond["thesis"],
        "courses": [{k: v for k, v in c.items() if k != "page"} | {"page": c["page"]} for c in courses],
    }


def review_markdown(req: dict) -> str:
    p = req["source"]["pages"]
    pp = req["source"].get("printedPages") or [None, None]
    lines = [
        f"# 卒業要件 抽出結果の確認シート（{req['department']['name']} {req['entryYear']}年度入学）",
        "",
        "> **このデータは未確認です（`verified: false`）。** 下の各項目を学部要覧 PDF と照合し、",
        "> すべて正しければ `data/requirements/*.json` の `verified` を `true` に変更してください。",
        "> 誤りがあれば JSON を直接修正してください（このファイルは再抽出で上書きされます）。",
        "",
        f"- 出典: [{req['source']['title']}]({req['source']['url']})",
        f"- 卒業条件等: PDF {p[0]} ページ（冊子のページ番号 {pp[0]}）",
        f"- 授業科目配置表: PDF {p[1]} ページ（冊子のページ番号 {pp[1]}）",
        "",
        "## 1. 卒業条件（科目区分ごとの最低単位）",
        "",
        "| 確認 | 科目区分 | 親区分 | 最低単位 | うち必修 | PDF頁 |",
        "|---|---|---|---:|---:|---:|",
    ]
    labels = {g["id"]: g["label"] for g in req["groups"]}
    for g in req["groups"]:
        lines.append(f"| ☐ | {g['label']} | {labels.get(g.get('parent') or '', '—')} | {g['minCredits']} | {g.get('requiredCredits', '')} | {g['page']} |")
    lines += [f"| ☐ | **合計** | — | **{req['totalCredits']}** | | {p[0]} |", ""]
    if req.get("choiceRules"):
        lines += ["## 2. 選択必修のルール", ""]
        for ch in req["choiceRules"]:
            lines.append(f"- ☐ {ch['label']}: {'、'.join(ch['courses'])} から **{ch['minCredits']}単位以上**（PDF {ch['page']}頁）")
        lines.append("")
    lines += ["## 3. 卒業研究着手条件", ""]
    for t in req.get("thesisPrerequisites", []):
        lines.append(f"- ☐ {t['rule']}（PDF {t['page']}頁）")
    lines += ["", "## 4. 授業科目配置表（必修は灰色セルから判定）", "",
              "| 確認 | 科目名 | 単位 | 設置年次 | 区分 | 必修 | PDF頁 |", "|---|---|---:|---:|---|:---:|---:|"]
    for c in req["courses"]:
        lines.append(f"| ☐ | {c['name']} | {c['credits']} | {c['year']} | {labels.get(c['group'], c['group'])} | {'必修' if c['required'] else ''} | {c['page']} |")
    # sanity checks
    lines += ["", "## 5. 自動チェック", ""]
    for g in req["groups"]:
        if "requiredCredits" in g:
            ids = {g["id"]} | {x["id"] for x in req["groups"] if (x.get("parent") or "").startswith(g["id"])}
            got = sum(c["credits"] for c in req["courses"] if c["required"] and c["group"] in ids)
            ok = "✅" if got == g["requiredCredits"] else "⚠️"
            lines.append(f"- {ok} {g['label']}: 配置表の必修単位合計 {got} / 卒業条件の必修 {g['requiredCredits']}")
    unknown = [c["name"] for c in req["courses"] if not c["group"]]
    lines.append(f"- {'✅' if not unknown else '⚠️'} 区分を判定できなかった科目: {', '.join(unknown) or 'なし'}")
    top = [g for g in req["groups"] if not g.get("parent")]
    lines.append(f"- {'✅' if sum(g['minCredits'] for g in top) <= req['totalCredits'] else '⚠️'} 区分最低単位の合計 {sum(g['minCredits'] for g in top)} ≤ 合計 {req['totalCredits']}"
                 f"（差 {req['totalCredits'] - sum(g['minCredits'] for g in top)} 単位は区分を問わず修得）")
    lines += ["", "## 6. 抽出できない・解釈が必要な点", "",
              "- 教養教育科目は「当学科では上記科目を推奨するが，共通科目配置表からも選択できる」とあり、配置表にない教養科目も区分に算入できる。アプリでは配置表にない科目を「区分を判定できなかった科目」として合計だけに数える。",
              "- 卒業研究着手条件はアプリの単位集計には使っていない（表示のみ）。",
              "- 上位区分の最低単位が下位区分の合計より大きい場合（例: 基礎科学分野 14 単位 > 数学系+物理学系+化学系 6 単位）、差はその上位区分内のどの科目でもよいと解釈している。",
              ""]
    if sum(g["minCredits"] for g in top) < req["totalCredits"]:
        lines.insert(-1, "- 区分最低単位の合計と総単位の差は自由選択枠（どの区分でもよい）と解釈している。要確認。")
    lines += crosscheck_markdown(req)
    return "\n".join(lines)


def crosscheck_values(req: dict, item: dict) -> tuple[float | None, int | None]:
    """Value of the extracted data that corresponds to one cross-check item."""
    if item.get("field") == "totalCredits":
        return req["totalCredits"], None
    if "choice" in item:
        ch = next((c for c in req.get("choiceRules", []) if c["id"] == item["choice"]), None)
        return (ch["minCredits"] if ch else None), None
    gid = item["groups"][0]
    g = next((x for x in req["groups"] if x["id"] == gid), None)
    if g is None:
        return None, None
    if item["field"] == "requiredFromCourses":
        rs = [c for c in req["courses"] if c["required"] and (c["group"] == gid or c["group"].startswith(gid + "."))]
        return sum(c["credits"] for c in rs), len(rs)
    if item["field"] == "requiredCredits":
        rs = [c for c in req["courses"] if c["required"] and (c["group"] == gid or c["group"].startswith(gid + "."))]
        return g.get("requiredCredits"), len(rs)
    return g.get(item["field"]), None


def crosscheck_markdown(req: dict) -> list[str]:
    slug = SLUGS.get(req["department"]["code"], req["department"]["code"])
    path = ROOT / "data" / "requirements" / "crosscheck" / f"{req['entryYear']}_{slug}.json"
    if not path.exists():
        return []
    ref = json.loads(path.read_text(encoding="utf-8"))
    lines = ["## 7. 別資料との照合", "",
             f"出典: {ref['source']}（{ref['checkedAt']} 照合）。学部要覧そのものではないので、これで `verified` を true にはしない。", ""]
    if ref.get("note"):
        lines += [f"> {ref['note']}", ""]
    lines += ["| 項目 | 別資料 | 抽出データ | 一致 |", "|---|---:|---:|:---:|"]
    for it in ref["items"]:
        v, n = crosscheck_values(req, it)
        exp = f"{it['credits']}単位" + (f" / {it['courses']}科目" if it.get("courses") is not None else "")
        got = "—" if v is None else f"{v:g}単位" + (f" / {n}科目" if n is not None and it.get("courses") is not None else "")
        ok = v is not None and v == it["credits"] and (it.get("courses") is None or n == it["courses"])
        lines.append(f"| {it['label']} | {exp} | {got} | {'✅' if ok else '⚠️'} |")
    lines.append("")
    return lines


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--pdf-url", default="https://www.cst.nihon-u.ac.jp/about/education/pdf/0_3_1_r7.pdf")
    ap.add_argument("--entry-year", type=int, default=2025)
    ap.add_argument("--dept", default="09")
    ap.add_argument("--out", default=None)
    ap.add_argument("--save-fixture", action="store_true", help="also save the two pages to tests/fixtures/")
    ap.add_argument("--page-offset", type=int, default=0,
                    help="add to page numbers (when --pdf is an excerpt, e.g. the 2-page test fixture: 73)")
    a = ap.parse_args(argv)

    req = extract(a.pdf, a.dept, a.entry_year, a.pdf_url, a.page_offset)
    out = Path(a.out) if a.out else ROOT / "data" / "requirements" / f"{a.entry_year}_{SLUGS[a.dept]}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(req, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    # 学科ごとの確認シート（電子工学科の既存シートは docs/REQUIREMENTS_REVIEW.md のまま）
    rv = ROOT / "docs" / ("REQUIREMENTS_REVIEW.md" if a.dept == "09" and a.entry_year == 2025 else f"requirements/REVIEW_{a.entry_year}_{SLUGS[a.dept]}.md")
    rv.parent.mkdir(parents=True, exist_ok=True)
    rv.write_text(review_markdown(req), encoding="utf-8")
    if a.save_fixture:
        from pypdf import PdfReader, PdfWriter
        r, w = PdfReader(a.pdf), PdfWriter()
        for pno in req["source"]["pages"]:
            w.add_page(r.pages[pno - 1 - a.page_offset])
        fx = ROOT / "tests" / "fixtures"
        fx.mkdir(parents=True, exist_ok=True)
        w.write(str(fx / f"youran_{a.entry_year}_{a.dept}.pdf"))
    print(f"{out.name}: {len(req['groups'])} groups, {len(req['courses'])} courses, total {req['totalCredits']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
