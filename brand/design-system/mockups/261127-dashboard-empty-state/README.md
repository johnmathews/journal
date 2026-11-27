# Dashboard: when the range is too quiet

**Question:** the dashboard opens on "Last 3 months", and when that range holds fewer than 5
entries it shows "Not enough data yet" even though the account has plenty. What should it do
instead? The charts, the filter bar, the 5-entry threshold and the tiles stay as they are, and no
colour is new.

**Status:** decided

**Link:** https://claude.ai/artifact/1xWE5JXA8ZqXzbaBUSQMeo

## Why it came up

Prod on 2026-11-27: the owner's account (user 1) has 77 entries, the newest on 16 Oct 2026. The
writing-stats query gives 2 entries in the last 3 months (1 week) and 77 for "All time" (28
weeks), so with "All time" the charts draw and the empty state is behaving as coded. Counts per
range: last month 0, last 3 months 2, last 6 months 32, last year 77, all time 77.

## Options

- **A. Today.** The empty card with the count and "Try widening the range". The reader finds the
  right range by trying pills.
- **B. The empty card offers the ranges that have enough.** The range stays put. The card says
  "2 entries in the last 3 months", gives the last entry's date, and offers "Show last 6 months
  (32 entries)" and "Show all time (77 entries)" as buttons. The dashboard never changes the
  range by itself.
- **C. Open on the shortest range that has enough.** (Recommended: the home page shows your
  writing on arrival, and the note keeps the switch visible.) On first load only, when "Last 3
  months" has fewer than 5 entries, the dashboard opens on the shortest range with 5 or more and
  says so above the charts: "Showing the last 6 months. The last 3 months have 2 entries, and the
  charts need 5." with a "Show the last 3 months" link. A range the reader picks is never changed.
  Note text is `accent-tint-ink` on `accent-tint`: 4.8:1 light, 5.6:1 dark.
- **D. Always draw the charts, with a note when they're thin.** The 5-entry gate goes. Below 5
  entries a note above the charts says so and links to "All time". Honest about the chosen range,
  but 13 weeks with one bar says little.

## Decision

**C**, decided 2026-11-27. Owner picked "C. Open on a range with enough (Recommended)". On the
first load only, a default range with fewer than 5 entries widens to the shortest range that has
5 or more, with a note above the charts and a "Show the last 3 months" link back. A range the
reader picks is never changed, and when no range has 5 the dashboard stays on the default and
shows the empty card.

## Rounds

- **1, 2026-11-27:** the first options.
