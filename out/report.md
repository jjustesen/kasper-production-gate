# Production gate run · Tuesday 13 October 2026, 09:00 UTC

30 briefs checked: **19 queued**, **11 blocked**.
Brain-rule checks: 29 from cache, 0 live model calls, 0 unchecked (sent to human review).

| Brief | Client | Result | Reasons |
|---|---|---|---|
| BR-01 | Northpeak Coffee | Queued | - |
| BR-02 | Northpeak Coffee | Blocked | Hazelnut Tin [NP-TIN-HAZ] is not active (Discontinued 2026-09-30) |
| BR-03 | Northpeak Coffee | Blocked | breaks Brain rule: 'barista pours into a takeaway cup' |
| BR-04 | Northpeak Coffee | Queued (rush approved) | - |
| BR-05 | Northpeak Coffee | Queued | - |
| BR-06 | Lumen Skin | Blocked | banned claims: 'before and after' |
| BR-07 | Lumen Skin | Queued | - |
| BR-08 | Lumen Skin | Queued | - |
| BR-09 | Lumen Skin | Queued | - |
| BR-10 | Lumen Skin | Blocked | Missing: platforms, formats (aspect ratio) |
| BR-11 | Ridge Outdoor | Blocked | Discount of 50% is above the 30% cap |
| BR-12 | Ridge Outdoor | Queued | - |
| BR-13 | Ridge Outdoor | Queued | - |
| BR-14 | Ridge Outdoor | Queued | - |
| BR-15 | Ridge Outdoor | Needs approval | Due Wed 14 Oct is 1 business day(s) out; statics need 3. Earliest normal date: Fri 16 Oct. Juliana said rush ok, but only the Squad Lead (Louise) can approve a rush |
| BR-16 | Pawfect Treats | Needs approval | Would take Pawfect Treats over this month's plan: videos 6/4 |
| BR-17 | Pawfect Treats | Queued | - |
| BR-18 | Pawfect Treats | Queued (overage approved) | - |
| BR-19 | Halo Sleep | Blocked | banned claims: 'cure', 'insomnia', 'clinically proven' |
| BR-20 | Halo Sleep | Queued | - |
| BR-21 | Halo Sleep | Queued | - |
| BR-22 | Brightside Kids | Blocked (internal) | Brightside Kids is paused: Paused 2026-10-05 pending overdue invoice. No new production until finance un-pauses |
| BR-23 | Halo Sleep | Queued | - |
| BR-24 | Northpeak Coffee | Queued | - |
| BR-25 | Lumen Skin | Blocked | banned claims: 'cura' |
| BR-26 | Pawfect Treats | Queued | - |
| BR-27 | Ridge Outdoor | Queued | - |
| BR-28 | Halo Sleep | Queued | - |
| BR-29 | Northpeak Coffee | Blocked | breaks Brain rule: 'The best-tasting subscription in the UK' |
| BR-30 | Halo Sleep | Queued | - |

## Quota after this run

- Northpeak Coffee: statics 18/20 · videos 2/6
- Lumen Skin: statics 12/16 · videos 1/4
- Ridge Outdoor: statics 12/12 · videos 3/4
- Pawfect Treats: statics 12/12 · videos 5/4
- Halo Sleep: statics 12/12 · videos 4/4
- Brightside Kids: statics 3/12 · videos 0/4

## Blocked briefs

### BR-02 · Hazelnut Tin autumn promo (Northpeak Coffee, blocked)

- Rule 4 `product_inactive`: Hazelnut Tin [NP-TIN-HAZ] is not active (Discontinued 2026-09-30).

Draft for #ext-northpeak-coffee:

> Hi team, before we start on "Hazelnut Tin autumn promo", one quick check: our catalog shows Hazelnut Tin as no longer available. Should we feature a different product instead?
> As soon as we hear back, it goes straight into production.

### BR-03 · UGC cold brew cut-downs (Northpeak Coffee, blocked)

- Rule 6 `brain_rule`: Breaks Brain rule "Always show the can or bag, never a generic cup." ('barista pours into a takeaway cup').

Draft for #ext-northpeak-coffee:

> Hi team, before we start on "UGC cold brew cut-downs", one quick check: "barista pours into a takeaway cup" goes against a brand rule we have on file ("Always show the can or bag, never a generic cup"). Could you share an alternative?
> As soon as we hear back, it goes straight into production.

### BR-06 · 14-day glow results (Lumen Skin, blocked)

- Rule 6 `banned_claim`: Copy uses banned claim 'before and after'.
- Rule 6 `brain_rule`: Breaks Brain rule "No before/after imagery or copy (client legal, Oct 2026)." ('Before and after: real customer, 14 days of Vitamin C').

Draft for #ext-lumen-skin:

> Hi team, before we start on "14-day glow results", one quick check: the copy includes "before and after", which is on the list of claims we've agreed not to use. Could you share an alternative line?
> As soon as we hear back, it goes straight into production.

### BR-10 · Starter kit gifting (Lumen Skin, blocked)

- Rule 2 `missing_fields`: Missing: platforms, formats (aspect ratio).

Draft for #ext-lumen-skin:

> Hi team, before we start on "Starter kit gifting", one quick check: could you confirm the platforms and formats (aspect ratio) for this brief?
> As soon as we hear back, it goes straight into production.

### BR-11 · Black Friday early access (Ridge Outdoor, blocked)

- Rule 6 `discount_over_cap`: Discount of 50% is above the 30% cap.

Draft for #ext-ridge-outdoor:

> Hi team, before we start on "Black Friday early access", one quick check: the brief says 50% off, but our agreed cap is 30%. Should we go with 30% (or lower)?
> As soon as we hear back, it goes straight into production.

### BR-15 · Bottle quick static (Ridge Outdoor, needs approval)

- Rule 3 `turnaround`: Due Wed 14 Oct is 1 business day(s) out; statics need 3. Earliest normal date: Fri 16 Oct. Juliana said rush ok, but only the Squad Lead (Louise) can approve a rush.

If the Squad Lead doesn't approve, send the client:

> Hi team, before we start on "Bottle quick static", one quick check: could we move the due date to Friday 16 October? That gives the team the time this needs.
> As soon as we hear back, it goes straight into production.

### BR-16 · Dental chews UGC (Pawfect Treats, needs approval)

- Rule 7 `quota_exceeded`: Would take Pawfect Treats over this month's plan: videos 6/4.

If the Squad Lead doesn't approve, send the client:

> Hi team, before we start on "Dental chews UGC", one quick check: this would take you past this month's plan (videos 6/4). Should we schedule it for next month, or add it as extra work?
> As soon as we hear back, it goes straight into production.

### BR-19 · Pillow spray claims test (Halo Sleep, blocked)

- Rule 6 `banned_claim`: Copy uses banned claim 'cure'.
- Rule 6 `banned_claim`: Copy uses banned claim 'insomnia'.
- Rule 6 `banned_claim`: Copy uses banned claim 'clinically proven'.
- Rule 6 `brain_rule`: Breaks Brain rule "Wellness, not medical: no insomnia, cure or treatment claims." ('Clinically proven to cure insomnia in 7 nights').
- Rule 6 `brain_rule`: Breaks Brain rule "'Clinically proven' only with a linked study (none exists today)." ('Clinically proven').

Draft for #ext-halo-sleep:

> Hi team, before we start on "Pillow spray claims test", one quick check: the copy includes "cure", "insomnia" and "clinically proven", which are on the list of claims we've agreed not to use. Could you share an alternative line?
> As soon as we hear back, it goes straight into production.

### BR-22 · Back-to-school lunchbox (Brightside Kids, blocked (internal))

- Rule 1 `client_paused`: Brightside Kids is paused: Paused 2026-10-05 pending overdue invoice. No new production until finance un-pauses.

No client message: an internal owner decides.

### BR-25 · Moisturiser texture video (Lumen Skin, blocked)

- Rule 6 `banned_claim`: Copy uses banned claim 'cura'.
- Rule 6 `brain_rule`: Breaks Brain rule "Cosmetic, not medical: never claim to treat, cure or heal a skin condition." ('a cura para a pele seca').

Draft for #ext-lumen-skin:

> Hi team, before we start on "Moisturiser texture video", one quick check: the copy includes "cura", which is on the list of claims we've agreed not to use. Could you share an alternative line?
> As soon as we hear back, it goes straight into production.

### BR-29 · Subscription perks statics (Northpeak Coffee, blocked)

- Rule 6 `brain_rule`: Breaks Brain rule "No superlatives we can't prove." ('The best-tasting subscription in the UK').

Draft for #ext-northpeak-coffee:

> Hi team, before we start on "Subscription perks statics", one quick check: "The best-tasting subscription in the UK" goes against a brand rule we have on file ("No superlatives we can't prove"). Could you share an alternative?
> As soon as we hear back, it goes straight into production.
