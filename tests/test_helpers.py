"""Unit tests for the pure helpers: dates, products, claims, approvals."""

from datetime import date, datetime, timezone

from gate import approvals, claims, products
from gate.business_days import add_business_days, business_days_between

TUE = date(2026, 10, 13)


class TestBusinessDays:
    def test_today_is_day_zero(self):
        assert business_days_between(TUE, TUE) == 0
        assert business_days_between(TUE, date(2026, 10, 14)) == 1

    def test_weekend_does_not_count(self):
        # Tue -> next Tue: Wed Thu Fri Mon Tue
        assert business_days_between(TUE, date(2026, 10, 20)) == 5

    def test_due_on_a_weekend(self):
        assert business_days_between(TUE, date(2026, 10, 18)) == 3  # Sunday

    def test_due_in_the_past(self):
        assert business_days_between(TUE, date(2026, 10, 9)) == 0

    def test_add_business_days_skips_weekend(self):
        assert add_business_days(TUE, 3) == date(2026, 10, 16)
        assert add_business_days(TUE, 5) == date(2026, 10, 20)
        assert add_business_days(date(2026, 10, 16), 1) == date(2026, 10, 19)  # Fri -> Mon


class TestProducts:
    catalog = [
        {"sku": "PT-JERKY-CHK", "name": "Chicken Jerky", "aliases": ["jerky", "chicken jerky"], "active": True},
        {"sku": "NP-TIN-HAZ", "name": "Hazelnut Tin", "aliases": ["hazelnut"], "active": False},
    ]

    def test_sku_name_alias_and_article(self):
        index = products.build_index(self.catalog)
        for text in ["PT-JERKY-CHK", "pt-jerky-chk", "Chicken Jerky", "jerky", "the chicken jerky", "  The  Chicken   Jerky "]:
            assert products.resolve(text, index)["sku"] == "PT-JERKY-CHK", text

    def test_unknown_product(self):
        assert products.resolve("turkey jerky", products.build_index(self.catalog)) is None

    def test_inactive_product_still_resolves(self):
        # Resolution finds it; the gate decides that inactive means blocked.
        assert products.resolve("Hazelnut Tin", products.build_index(self.catalog))["active"] is False

    def test_brand_only(self):
        assert products.is_brand_only("Brand")
        assert not products.is_brand_only("brand kit")


class TestClaims:
    def test_whole_words_only(self):
        assert claims.find_banned("Feel secure all night", ["cure"]) == []
        assert claims.find_banned("The cure for dry skin", ["cure"]) == ["cure"]

    def test_water_resistant_is_not_waterproof(self):
        assert claims.find_banned("Water-resistant shell, tested in drizzle", ["waterproof"]) == []
        assert claims.find_banned("Fully WATERPROOF shell", ["waterproof"]) == ["waterproof"]

    def test_portuguese_banned_word(self):
        assert claims.find_banned("Mensagem: a cura para a pele seca.", ["cure", "cura"]) == ["cura"]

    def test_phrase_with_hyphens_or_extra_spaces(self):
        banned = ["before and after"]
        assert claims.find_banned("Before-and-after results", banned) == banned
        assert claims.find_banned("before   and after", banned) == banned

    def test_discount_extraction(self):
        assert claims.max_discount("Early access: 50% off the Trail Pack.") == 50
        assert claims.max_discount("20% off first box, 25 % off after") == 25
        assert claims.max_discount("Save 15% today") == 15
        assert claims.max_discount("100% natural, no discount talk") is None
        assert claims.max_discount("Keeps coffee hot for 12 hours.") is None


class TestApprovals:
    now = datetime(2026, 10, 13, 9, 0, tzinfo=timezone.utc)

    def comment(self, by, text, at="2026-10-12T16:10:00Z"):
        return {"by": by, "at": at, "text": text}

    def test_squad_lead_rush_approval(self):
        found, others = approvals.find_approval([self.comment("Louise", "Rush approved — Louise.")], "rush", "Louise", self.now)
        assert found and not others

    def test_designer_rush_ok_does_not_count(self):
        found, others = approvals.find_approval([self.comment("Juliana", "rush ok, I can squeeze it in")], "rush", "Louise", self.now)
        assert found is None and [c["by"] for c in others] == ["Juliana"]

    def test_negated_approval(self):
        found, _ = approvals.find_approval([self.comment("Louise", "Rush not approved, move the date")], "rush", "Louise", self.now)
        assert found is None

    def test_approval_after_check_time_is_ignored(self):
        late = self.comment("Louise", "Rush approved", at="2026-10-13T10:00:00Z")
        assert approvals.find_approval([late], "rush", "Louise", self.now)[0] is None

    def test_rush_approval_is_not_an_overage_approval(self):
        found, _ = approvals.find_approval([self.comment("Bea A.", "Rush approved")], "overage", "Bea A.", self.now)
        assert found is None
