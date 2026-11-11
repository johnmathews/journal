# Fix cursor offset in edit mode and harden entity highlighting

**Date:** 2026-04-13

## Summary

Fixed a cursor offset bug in the entry detail edit view where the cursor position
diverged from the visible text after editing. Also fixed two latent bugs in entity
highlight rendering and added auto-refresh of entity data after text saves.

## Bugs fixed

### 1. Cursor offset in mirror-div editor (primary)

The `@tailwindcss/forms` plugin (`strategy: base`) injects `border-width: 1px` on
all `<textarea>` elements. The corrected-text textarea was missing `border-0`,
creating a 2px content width difference vs the backdrop `<div>`. Text wrapped at
different positions, causing cumulative cursor drift over multiple lines (~4 chars
after ~15-20 lines of text).

**Fix:** Added `border-0` to the textarea class list.

### 2. Entity highlight regex matched inside HTML tags (latent)

`applyEntityHighlight` used `[^<>]+` to find "text nodes" but this also matched
tag attributes. An entity named "text" or "dark" would inject `<mark>` tags inside
CSS class attributes, corrupting the DOM.

**Fix:** Replaced with `(<[^>]*>)|([^<]+)` alternation that properly skips HTML
tags and only highlights text runs.

### 3. Entity terms with quotes failed to highlight (minor)

`escapeForHighlight` didn't HTML-escape `'` or `"`, but `segmentsToHtml` escapes
them to `&#39;` and `&quot;`. Entity names like "O'Brien" silently failed to match.

**Fix:** Added `"` and `'` escaping to match `segmentsToHtml`'s `escapeHtml()`.

## Entity data refresh after save

After saving corrected text, the frontend now:
- Clears any active entity highlight (stale terms may not match edited text)
- Reloads entity chip data after a 5-second delay to pick up re-extracted entities

## Tests added

- Entity highlight does not corrupt HTML when term matches a CSS class substring
- Textarea has `border-0` class (regression guard)
- Entity terms with apostrophes are highlighted correctly
