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
