# UK Charity Legacy Interest Calculator

A static, client-side web page that calculates the interest owed on a
charity legacy when payment was delayed beyond the **first anniversary of
the date of death**.

All calculation happens in the browser — no
backend, no network calls at runtime (other than loading `rates.json` from
the same site).

**Live page:** https://ben-clayton.github.io/uk-charity-interest-calculator/

## How the calculation works

- Interest starts accruing on the **anniversary of death** (date of death
  + 1 calendar year). No interest is owed for the first year.
- **Simple interest on the original amount** — never compounding. Every
  band uses the original principal; the cumulative column is display-only.
- Each rate band contributes `principal × rate × (days / 365)`.
- A **365-day year is used always** (not 365.25, not actual/actual).
- Day counts are inclusive of both the band's first and last day, and of
  the accrual window.

## Updating the interest rates (no developer needed)

When the Lord Chancellor announces a new Court Funds Office (CFO) Basic
Account rate:

1. Click **"Suggest a rate change"** at the bottom of the live page (or
   [edit `rates.json` on GitHub](https://github.com/ben-clayton/uk-charity-interest-calculator/edit/main/rates.json)).
   GitHub opens the file in its web editor and walks you through a pull
   request — no git, no checkout.
2. **Append** a new band at the end:
   ```json
   { "rate": 0.0282, "start": "2026-01-09", "end": "2099-12-31",
     "source": "https://www.gov.uk/government/news/...", "announced": "2026-01-08" }
   ```
   - `rate` is a decimal: 2.82% → `0.0282`.
   - `start` is the new rate's **effective date**.
   - `source` is the gov.uk announcement URL (this is what makes a
     calculation auditable — keep it accurate).
3. Change the **previous** final band's `"end"` from `"2099-12-31"` to the
   day **before** the new band's `start`.
4. Update the top-level `"lastVerified"` to today's date.
5. Commit / open the PR with a message citing the source URL, e.g.
   *"Add CFO Basic rate 2.82% from 2026-01-09 (source: gov.uk/...)"*.

The bands must be **contiguous** (each band starts the day after the
previous one ends) and non-overlapping. If they aren't, the live page
shows a loud red error and disables the calculator rather than producing
wrong numbers — so a bad edit fails safely. Re-run `test.html` after any
change.

### Why rates aren't fetched live from gov.uk

CORS blocks reading gov.uk from a browser; gov.uk has no machine-readable
rate feed (each change is a prose news article); and a committed value
with a source URL and an author is a stronger audit trail than a value
scraped at calculation time. So rates live in `rates.json` in this repo.

### Rate verification status

Every band from **6 June 2016 onwards** has been verified against the
authoritative GOV.UK announcement and now carries that announcement's URL
and publication date (`announced`). The verification was done by walking
the full set of Court Funds Office rate-change articles published by the
Ministry of Justice on GOV.UK and matching each "Basic Account changed
from X% to Y% from [date]" statement to a band.

## Disclaimer

The CFO Basic Account rate is a defensible reference rate for delayed
legacies, but whether it is the *legally correct* rate for any given claim
is a separate question and should be confirmed with the charity's legal
advisors.
