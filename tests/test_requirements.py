"""Requirement extraction from the 2-page 学部要覧 excerpt (電子工学科, 2025年度入学)."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import extract_requirements as E  # noqa: E402
import validate_data as V  # noqa: E402

PDF = ROOT / "tests" / "fixtures" / "youran_2025_09.pdf"


@unittest.skipUnless(PDF.exists(), "PDF fixture missing")
class Electronics2025(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.req = E.extract(str(PDF), "09", 2025, "https://example.invalid/youran.pdf", page_offset=73)
        cls.groups = {g["id"]: g for g in cls.req["groups"]}
        cls.courses = {E.nf(c["name"]): c for c in cls.req["courses"]}

    def test_marked_unverified(self):
        self.assertIs(self.req["verified"], False)

    def test_pages(self):
        self.assertEqual(self.req["source"]["pages"], [74, 75])
        self.assertEqual(self.req["source"]["printedPages"], [73, 74])

    def test_totals(self):
        self.assertEqual(self.req["totalCredits"], 126)
        self.assertEqual(self.groups["major"]["minCredits"], 86)
        self.assertEqual(self.groups["major"]["requiredCredits"], 43)
        self.assertEqual(self.groups["liberal"]["minCredits"], 16)
        self.assertEqual(self.groups["basic"]["minCredits"], 22)
        self.assertEqual(self.groups["basic.global"]["minCredits"], 7)
        self.assertEqual(self.groups["basic.science"]["minCredits"], 14)
        self.assertEqual(self.groups["liberal.g1"]["minCredits"], 6)

    def test_course_table(self):
        self.assertEqual(len(self.req["courses"]), 120)
        c = self.courses["回路理論I"]
        self.assertEqual((c["credits"], c["year"], c["group"], c["required"]), (2, 1, "major", True))
        c = self.courses["電気計測"]
        self.assertEqual((c["credits"], c["year"], c["required"]), (2, 2, False))
        self.assertEqual(self.courses["スポーツI"]["group"], "liberal.g2")
        self.assertTrue(self.courses["スポーツI"]["required"])
        self.assertEqual(self.courses["微分積分学I"]["group"], "basic.science.math")
        self.assertEqual(self.courses["卒業研究"]["credits"], 6)

    def test_required_credits_match_conditions(self):
        major_req = sum(c["credits"] for c in self.req["courses"] if c["group"] == "major" and c["required"])
        self.assertEqual(major_req, 43)

    def test_choice_rules(self):
        ids = {c["id"]: c for c in self.req["choiceRules"]}
        self.assertEqual(ids["basic.global.a"]["minCredits"], 2)
        self.assertEqual(len(ids["basic.global.a"]["courses"]), 4)
        self.assertEqual(self.courses["英語特殊講義A"].get("choice"), "basic.global.b")

    def test_passes_validator(self):
        errors, _ = V.validate_requirements(self.req, "fixture")
        self.assertEqual(errors, [])


class Validator(unittest.TestCase):
    def base(self):
        return {"meta": {"year": 2026}, "departments": [{"code": "09", "name": "x", "courseIds": ["A1"]}],
                "courses": [{"id": "A1", "name": "x", "credits": 2, "grade": 1,
                             "slots": [{"day": 1, "period": 1}], "sessions": [], "evaluation": {"parts": []}}]}

    def test_ok(self):
        self.assertEqual(V.validate_courses(self.base())[0], [])

    def test_bad_credits_and_slot_and_dup(self):
        d = self.base()
        d["courses"][0]["credits"] = 0
        d["courses"][0]["slots"].append({"day": 7, "period": 1})
        d["courses"].append(dict(d["courses"][0]))
        errs = V.validate_courses(d)[0]
        self.assertTrue(any("credits" in e for e in errs))
        self.assertTrue(any("bad slot" in e for e in errs))
        self.assertTrue(any("duplicate 時間割CD" in e for e in errs))


if __name__ == "__main__":
    unittest.main()


def test_crosscheck_reference_matches_extracted_2025_electronics():
    import json
    from extract_requirements import ROOT, crosscheck_values
    req = json.loads((ROOT / "data/requirements/2025_electronics.json").read_text(encoding="utf-8"))
    ref = json.loads((ROOT / "data/requirements/crosscheck/2025_electronics.json").read_text(encoding="utf-8"))
    for it in ref["items"]:
        v, n = crosscheck_values(req, it)
        assert v == it["credits"], it["label"]
        if it.get("courses") is not None:
            assert n == it["courses"], it["label"]
