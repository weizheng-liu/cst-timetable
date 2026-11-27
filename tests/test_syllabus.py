"""Unit tests for the syllabus parser, using real API responses saved as fixtures."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import syllabus_lib as L  # noqa: E402

FX = ROOT / "tests" / "fixtures"
RULES = L.load_eval_rules()


def course(jcd: str) -> dict:
    idx = json.loads((FX / "index_09.json").read_text(encoding="utf-8"))
    entry = next(e for e in L.index_entries(idx) if e["jikanwariCD"][0] == jcd)
    detail = json.loads((FX / f"course_{jcd}.json").read_text(encoding="utf-8"))
    return L.build_course(entry, detail, "2026", RULES)


class CodeTables(unittest.TestCase):
    def test_term(self):
        self.assertEqual(L.term_of("21"), "前期")
        self.assertEqual(L.term_of("22"), "前期")
        self.assertEqual(L.term_of("31"), "後期")
        self.assertEqual(L.term_of("11"), "年間")
        self.assertEqual(L.term_of(None), "不明")

    def test_day(self):
        self.assertEqual(L.day_of("2"), 1)  # 月
        self.assertEqual(L.day_of("7"), 6)  # 土
        self.assertIsNone(L.day_of("1"))  # 日曜は扱わない
        self.assertIsNone(L.day_of(""))

    def test_slots_consecutive(self):
        self.assertEqual(L.slots_from_jikanwari({"youbiKbn": "4", "jigen": "1", "renzokuJigen": "2"}),
                         [{"day": 3, "period": 1}, {"day": 3, "period": 2}])

    def test_bikou(self):
        self.assertEqual(L.parse_bikou("{1}{未来}"), ["1", "未来"])
        self.assertEqual(L.parse_bikou(""), [])

    def test_norm_name(self):
        self.assertEqual(L.norm_name("回路理論Ⅰ"), L.norm_name("回路理論I"))
        self.assertEqual(L.norm_name("English Communication Ⅱ"), "EnglishCommunicationII")


class BuildCourse(unittest.TestCase):
    def test_basic_fields(self):
        c = course("J51A")
        self.assertEqual(c["name"], "回路理論Ⅰ")
        self.assertEqual(c["code"], "5109")
        self.assertEqual(c["term"], "前期")
        self.assertEqual(c["slots"], [{"day": 5, "period": 1}])
        self.assertEqual(c["credits"], 2)
        self.assertEqual(c["grade"], 1)
        self.assertEqual(c["classGroup"], "1")
        self.assertEqual(c["teachers"], ["布施 匡章"])
        self.assertIn("pageID=", c["url"])

    def test_sessions(self):
        c = course("J51A")
        reg = [s for s in c["sessions"] if s["kind"] == "regular"]
        od = [s for s in c["sessions"] if s["kind"] == "ondemand"]
        self.assertEqual(len(reg), 13)
        self.assertEqual(reg[0]["date"], "2026-04-17")
        self.assertEqual(reg[0]["mode"], "face")
        self.assertEqual(len(od), 1)
        self.assertEqual(od[0]["mode"], "ondemand")
        self.assertEqual((od[0]["date"], od[0]["endDate"]), ("2026-07-18", "2026-07-24"))
        # 理解度確認テスト has no own date; it is filled from the default schedule
        self.assertIsNotNone(reg[-1]["date"])

    def test_multi_period_sessions_are_merged(self):
        c = course("J31C")  # 水1・2
        self.assertEqual(len(c["slots"]), 2)
        reg = [s for s in c["sessions"] if s["kind"] == "regular"]
        # 28 raw rows (13 classes + test, each 2 periods) -> one entry per class
        self.assertEqual(len(reg), 13)
        self.assertEqual(len({s["no"] for s in reg}), len(reg))

    def test_year_long(self):
        c = course("J23B")
        self.assertEqual(c["term"], "年間")
        self.assertEqual(c["slots"], [{"day": 2, "period": 3}, {"day": 2, "period": 4}])

    def test_textbook(self):
        c = course("J51A")
        self.assertTrue(c["textbooks"][0]["name"].startswith("エレクトロニクスのための回路理論"))


class Evaluation(unittest.TestCase):
    def parse(self, t):
        return L.parse_evaluation(t, RULES)

    def test_parts_and_categories(self):
        r = self.parse("理解度確認テスト(45％)、中間試験(25％)、宿題(20％)、取り組み(10％)")
        self.assertEqual([p["category"] for p in r["parts"]], ["exam", "exam", "report", "attendance"])
        self.assertEqual(r["totals"]["exam"], 70)
        self.assertIn("exam-heavy", r["tags"])
        self.assertNotIn("no-exam", r["tags"])

    def test_no_exam_and_attendance(self):
        r = self.parse("授業参加度・発表　60%\nオンデマンド課題　10%\n授業内容確認課題（第13週）30%")
        self.assertIn("no-exam", r["tags"])
        self.assertIn("attendance-heavy", r["tags"])

    def test_report_heavy(self):
        r = self.parse("レポート 80%, 出席 20%")
        self.assertIn("report-heavy", r["tags"])
        self.assertIn("no-exam", r["tags"])

    def test_label_stops_at_previous_percentage(self):
        r = self.parse("定期試験 70% および課題提出などの平常点 30%")
        self.assertEqual([p["label"] for p in r["parts"]], ["定期試験", "課題提出などの平常点"])
        self.assertEqual(r["parts"][1]["category"], "report")

    def test_quiz_is_not_exam(self):
        r = self.parse("小テスト 30%、レポート 70%")
        self.assertEqual(r["parts"][0]["category"], "quiz")
        self.assertIn("no-exam", r["tags"])

    def test_no_percentages_gives_no_tags(self):
        r = self.parse("授業への取り組みを総合的に評価する。")
        self.assertEqual(r["parts"], [])
        self.assertEqual(r["tags"], [])


if __name__ == "__main__":
    unittest.main()


def test_grade_of_maps_unknown_codes_to_none():
    from syllabus_lib import grade_of
    assert grade_of("2") == 2
    assert grade_of("8") is None
    assert grade_of("") is None
    assert grade_of(None) is None


# 「クラス」欄の実例（2026年度 gakka=99 の Index から）
ELIG_CASES = [
    ("", "open", None),
    ("3", "open", None),
    ("2S3-6", "open", None),
    ("夏季集中授業", "open", None),
    ("精機・航宇・電子", "depts", {1: True, 2: True}),
    ("建築２・電気", "depts", {2: False}),
    ("海建・数学・情報", "depts", {1: False}),
    ("精密機械工学科１クラス，航空宇宙工学科１クラス，電子工学科１クラス", "depts", {1: True}),
    ("機械工学科Aクラス，電気工学科Aクラス", "depts", {1: False}),
    ("数学科以外の学生用クラス", "depts", {1: True}),
    ("数学科の学生用クラス", "depts", {1: False}),
    ("全学科（学科・学年による履修制限はない）", "open", None),
    ("１年生は土木・海建・機械・電子のみ。２年生以上は学科による履修制限はありません。", "graded", {1: True, 2: True, 3: True}),
    ("１年生は交通・建築・まちのみ、２年生以上は全学科", "graded", {1: False, 2: True}),
    ("２年生は土木・建築・応化・物理のみ。 ３年生以上は学科による履修制限はありません。", "graded", {2: False, 3: True, 4: True}),
    ("2年生は機械・電子・数学・まちのみ、3年生以上は全学科", "graded", {2: True}),
    ("1年生は､ 土木工学科･海洋建築 工学科･機械工学科･電子工学科の み。2年生以上は､ 学科による履 修制限はない。", "graded", {1: True}),
    ("1年生は 精機・航宇・電気のみ。 2年生以上は全学科", "graded", {1: False, 2: True}),
    ("４年生以上のみ", "graded", {3: False, 4: True}),
    ("駿河台全学科 学生番号奇数 2年次～", "graded", {1: False, 2: True}),
    ("★再履他、すべての科目", "special", None),
    ("学科共通（留学生）", "special", None),
    ("教職課程_理科免許（1年時に基礎物理学実験の設置のない学科）", "special", None),
    ("集中授業", "open", None),
]


def elig_ok(e, dept, grade):
    for r in e["rules"]:
        if (r["minGrade"] is None or grade >= r["minGrade"]) and (r["maxGrade"] is None or grade <= r["maxGrade"]):
            return r["depts"] is None or dept in r["depts"]
    return False


def test_parse_eligibility_examples():
    from syllabus_lib import parse_eligibility
    for text, kind, checks in ELIG_CASES:
        e = parse_eligibility(text)
        assert e["kind"] == kind, (text, e)
        for grade, ok in (checks or {}).items():
            assert elig_ok(e, "09", grade) == ok, (text, grade, e)


def test_parse_eligibility_keeps_seimitsu_and_kaiyou_apart():
    from syllabus_lib import depts_in
    assert depts_in("精密機械工学科") == ["06"]
    assert depts_in("海洋建築工学科") == ["04"]
    assert depts_in("機械・建築") == ["05", "03"]
    assert depts_in("応用情報工学科・物質応用化学科") == ["15", "10"]


def test_tidy_teachers_drops_summary_label():
    from syllabus_lib import tidy_teachers
    assert tidy_teachers(["大谷・布施 他", "大谷 昭仁", "布施 匡章", "大谷 昭仁"]) == ["大谷 昭仁", "布施 匡章"]
    assert tidy_teachers(["大谷・布施 他"]) == ["大谷・布施 他"]


def test_evaluation_ignores_total_line():
    from syllabus_lib import load_eval_rules, parse_evaluation
    ev = parse_evaluation("参加度 20%\n中間テスト 30%\nレポート 50%\n合計 100%", load_eval_rules())
    assert [p["label"] for p in ev["parts"]] == ["参加度", "中間テスト", "レポート"]


def test_scrape_end_to_end_with_fixtures():
    """scrape() with a fake client: catches wiring bugs the pure parsers cannot (e.g. shadowed names)."""
    import json
    from pathlib import Path
    import scrape_syllabus as ss

    fx = Path(__file__).parent / "fixtures"
    idx = json.loads((fx / "index_09.json").read_text(encoding="utf-8"))
    # duplicate one page so the shared-時間割CD merge path runs
    idx["gakkaData"]["syllabusData"].append(idx["gakkaData"]["syllabusData"][0])

    class Fake:
        requests = 0

        def get_json(self, path):
            self.requests += 1
            if "/Index?" in path:
                return idx
            jcd = path.split("jikanwariCD=")[1].split("&")[0]
            f = fx / f"course_{jcd}.json"
            return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}

    r = ss.scrape("2026", ["09"], None, Fake(), log=lambda *_: None)
    assert r["departments"][0]["name"] == "電子工学科"
    assert len(r["courses"]) == len({e["jikanwariCD"][0] for e in idx["gakkaData"]["syllabusData"]})
