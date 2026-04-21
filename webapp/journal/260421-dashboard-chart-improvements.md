# Dashboard chart improvements

## Writing Consistency heatmap

Overhauled the Writing Consistency calendar heatmap:

- **Full-width layout**: Moved from a cramped 50% column (shared with "What I Write
  About") to its own full-width row. Entity Distribution also became a standalone
  full-width section below it.
- **Larger cells**: Increased from 14px to 18px with 3px gaps (from 2px). Label fonts
  bumped from 10px to 11px. Month label positioning multiplier updated to match.
- **Word count coloring**: Changed from coloring by entry count (1/2/3+) to coloring by
  total words written per day. Uses quantile-based thresholds (25th/50th/75th percentile
  of non-zero days) so outlier heavy-writing days stand out against typical days.
- Tooltip now shows words first: "Apr 15, 2026: 1,234 words (2 entries)"
- Legend text: "Fewer words / More words"

## Entry Length Distribution removed

Removed the Entry Length Distribution chart entirely (template, render function, watcher,
lifecycle hooks, store loading calls). The word-count heatmap now serves the "how much
did I write" question better. Removed 4 corresponding tests.

## Topic Trends: line chart to stacked bar

Converted the Topic Trends chart from a line chart to a stacked bar chart. Entity
mentions are discrete per-period counts, not continuous values, so interpolated lines
were misleading. Stacked bars show the composition of mentions per time period.

## Topic Trends: legend dimming

Replaced the hide/show toggle (which caused Chart.js strikethrough on legend labels)
with an opacity-based focus model. Clicking a legend item dims all other datasets to
12% opacity while keeping the focused dataset at 85%. Clicking again restores all.
Custom `generateLabels` ensures no strikethrough styling appears.

## Tests

Added 2 new tests for the word-count heatmap: quantile-based cell coloring and tooltip
content. Removed 4 word distribution tests. Branch coverage stays above the 85% threshold.
