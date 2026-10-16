"""Each Definition of Ready rule, on briefs built for the case (not the 30 test briefs)."""

from conftest import NOW, FakeBrain

from gate.gate import Gate


def run(clients, *briefs, brain=None):
    return Gate(clients, brain or FakeBrain(), now=NOW).run(list(briefs))


def codes(verdict):
    return [r.code for r in verdict.reasons]


def test_clean_brief_passes(clients, make_brief):
    [v] = run(clients, make_brief())
    assert v.status == "PASS" and v.reasons == []


def test_rule1_paused_client_is_internal_and_skips_the_llm(clients, make_brief):
    brain = FakeBrain()
    [v] = run(clients, make_brief(client="Brightside Kids", products=["BK-LUNCH"]), brain=brain)
    assert codes(v) == ["client_paused"]
    assert v.kind == "internal" and v.client_message is None
    assert brain.calls == 0


def test_rule2_collects_every_missing_field(clients, make_brief):
    [v] = run(clients, make_brief(platforms=[], formats=[], deliverables={"statics": 0, "videos": 0}))
    assert codes(v) == ["missing_fields"]
    assert "platforms" in v.reasons[0].detail and "formats" in v.reasons[0].detail
    assert "deliverable counts" in v.reasons[0].detail


def test_rule2_video_needs_a_duration(clients, make_brief):
    [v] = run(clients, make_brief(formats=["9:16"], deliverables={"statics": 0, "videos": 1}, due_date="2026-10-23"))
    assert "video duration" in v.reasons[0].detail


def test_rule3_statics_exactly_three_days_pass(clients, make_brief):
    [v] = run(clients, make_brief(due_date="2026-10-16"))
    assert v.status == "PASS" and v.business_days == 3


def test_rule3_video_needs_five_days(clients, make_brief):
    video = dict(formats=["9:16 15s"], deliverables={"statics": 0, "videos": 1})
    assert run(clients, make_brief(due_date="2026-10-19", **video))[0].status == "BLOCKED"
    assert run(clients, make_brief(due_date="2026-10-20", **video))[0].status == "PASS"


def test_rule3_mixed_brief_uses_the_video_minimum(clients, make_brief):
    [v] = run(clients, make_brief(formats=["4:5", "9:16 15s"], deliverables={"statics": 1, "videos": 1}, due_date="2026-10-16"))
    assert codes(v) == ["turnaround"]


def test_rule3_rush_needs_the_squad_lead(clients, make_brief):
    designer = [{"by": "Juliana", "at": "2026-10-12T19:40:00Z", "text": "rush ok"}]
    lead = [{"by": "Louise", "at": "2026-10-12T19:40:00Z", "text": "Rush approved"}]
    [blocked] = run(clients, make_brief(due_date="2026-10-14", comments=designer))
    [passed] = run(clients, make_brief(due_date="2026-10-14", comments=lead))
    assert codes(blocked) == ["turnaround"] and blocked.kind == "approval"
    assert "Juliana" in blocked.reasons[0].detail and "Fri 16 Oct" in blocked.reasons[0].detail
    assert blocked.client_message is None and "Friday 16 October" in blocked.client_message_if_declined
    assert passed.status == "PASS" and passed.approvals == ["rush"]


def test_rush_from_another_clients_squad_lead_does_not_count(clients, make_brief):
    bea = [{"by": "Bea A.", "at": "2026-10-12T19:40:00Z", "text": "Rush approved"}]
    [v] = run(clients, make_brief(due_date="2026-10-14", comments=bea))  # Northpeak's lead is Louise
    assert codes(v) == ["turnaround"]


def test_rule4_unknown_and_inactive_products(clients, make_brief):
    [v] = run(clients, make_brief(products=["oat brew", "Hazelnut Tin", "mocha pods"]))
    assert codes(v) == ["product_inactive", "product_unknown"]
    assert v.skus == ["NP-CB-OAT"]


def test_rule4_alias_is_matched_inside_the_clients_catalog_only(clients, make_brief):
    # "kit" exists at Lumen and Halo; at Northpeak it is unknown.
    [v] = run(clients, make_brief(products=["kit"]))
    assert codes(v) == ["product_unknown"]


def test_rule4_brand_only_work(clients, make_brief):
    [v] = run(clients, make_brief(products=["brand"]))
    assert v.status == "PASS"


def test_rule5_studio_catalog_replaces_drive_link(clients, make_brief):
    assert run(clients, make_brief(assets_link="", use_studio_catalog=True))[0].status == "PASS"
    assert codes(run(clients, make_brief(assets_link="", use_studio_catalog=False))[0]) == ["assets_missing"]


def test_rule6_discount_at_cap_passes_and_above_blocks(clients, make_brief):
    assert run(clients, make_brief(copy_direction="25% off your first box"))[0].status == "PASS"
    assert codes(run(clients, make_brief(copy_direction="26% off your first box"))[0]) == ["discount_over_cap"]


def test_rule6_notes_are_not_checked_for_claims(clients, make_brief):
    [v] = run(clients, make_brief(client="Lumen Skin", products=["LS-MOIST"], notes="No cure claims, client legal."))
    assert v.status == "PASS"


def test_rule6_brain_violation_and_unsure(clients, make_brief):
    rule = "No superlatives we can't prove."
    [violates] = run(clients, make_brief(), brain=FakeBrain({rule: "violates"}))
    [unsure] = run(clients, make_brief(), brain=FakeBrain({rule: "unsure"}))
    assert codes(violates) == ["brain_rule"] and violates.kind == "client"
    assert codes(unsure) == ["brain_unsure"] and unsure.kind == "internal" and unsure.client_message is None


def test_rule7_blocked_briefs_do_not_use_quota(clients, make_brief):
    # Ridge: 5 of 12 statics used. A blocked 4-static brief must not eat quota.
    ridge = dict(client="Ridge Outdoor", products=["RO-BOTTLE"])
    first = make_brief(id="A", deliverables={"statics": 4, "videos": 0}, copy_direction="60% off", **ridge)
    second = make_brief(id="B", created_at="2026-10-12T09:00:00Z", deliverables={"statics": 7, "videos": 0}, **ridge)
    a, b = run(clients, first, second)
    assert a.status == "BLOCKED" and b.status == "PASS"
    assert b.quota_after["statics"] == {"used": 12, "plan": 12}


def test_rule7_quota_counts_this_batch_in_created_at_order(clients, make_brief):
    ridge = dict(client="Ridge Outdoor", products=["RO-BOTTLE"], deliverables={"statics": 4, "videos": 0})
    late = make_brief(id="LATE", created_at="2026-10-12T12:00:00Z", **ridge)
    early = make_brief(id="EARLY", created_at="2026-10-12T08:00:00Z", **ridge)
    # 5 used + 4 = 9 ok; + 4 = 13 > 12 blocked. Order follows created_at, not list order.
    verdicts = {v.brief_id: v for v in run(clients, late, early)}
    assert verdicts["EARLY"].status == "PASS" and codes(verdicts["LATE"]) == ["quota_exceeded"]


def test_rule7_overage_approval_covers_only_its_own_brief(clients, make_brief):
    pawfect = dict(client="Pawfect Treats", products=["PT-BOX"], formats=["9:16 15s"],
                   deliverables={"statics": 0, "videos": 1}, due_date="2026-10-27")
    approval = [{"by": "Bea A.", "at": "2026-10-12T15:05:00Z", "text": "Overage approved by Bea A."}]
    no_ok = make_brief(id="NO", **pawfect)
    ok = make_brief(id="OK", created_at="2026-10-12T09:00:00Z", comments=approval, **pawfect)
    a, b = run(clients, no_ok, ok)
    assert codes(a) == ["quota_exceeded"]
    assert b.status == "PASS" and b.approvals == ["overage"]
    assert b.quota_after["videos"] == {"used": 5, "plan": 4}


def test_every_failure_is_reported_not_just_the_first(clients, make_brief):
    [v] = run(clients, make_brief(products=["Hazelnut Tin"], copy_direction="40% off", assets_link="", due_date="2026-10-14"))
    assert codes(v) == ["turnaround", "product_inactive", "assets_missing", "discount_over_cap"]
    # One message to the client covering everything, including the date.
    msg = v.client_message
    assert "Hazelnut Tin" in msg and "40%" in msg and "Drive link" in msg and "Friday 16 October" in msg
