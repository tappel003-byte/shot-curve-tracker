Move Starting level to the bottom as a compact pill

Goal
- Treat Starting level as a one-time, rarely touched setting.
- Move it out of the main flow and reduce it to a small line/pill at the bottom of the Curve page.

Changes
1. Remove the Starting level card from its current position (between Chart and Log form).
2. Add a compact Starting level section at the bottom of `src/routes/index.tsx`, below Export/Import.
   - When a starting level is set: show a small pill/row like "Starting level: X.XX mg at <date/time>" with an Edit button.
   - When expanded: show the existing mg / Date / Time inputs and Set/Update / Remove actions.
   - When no starting level is set: show a small "Set starting level" button that expands the form.
3. Keep persistence, export/import, and math behavior unchanged — only the placement and collapsed presentation change.

Verification
- Typecheck with `tsgo`.
- Playwright check on mobile viewport: starting level saves, collapses to the bottom pill, Edit expands it, Remove clears it, and it survives a refresh.
