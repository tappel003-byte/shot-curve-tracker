# Smooth the Shot Curve line

## Scope
- Change only the chart’s display sampling and line rendering.
- Leave shot storage, saved records, localStorage keys, import/export, logged-shot history, starting level, recon, reminders, sites, and dose controls untouched.

## Implementation
1. Keep the existing contribution and total on-board formulas unchanged: linear rise through 24 hours, then five-day half-life decay, summed with the decaying starting level.
2. Sample the chart from its existing start and end times at fixed two-hour intervals, adding only the final display endpoint when needed. These points remain in memory and are never saved or exported.
3. Replace the SVG polyline with a monotone cubic SVG path so the line flows smoothly through the sampled values without overshoot, corners, or vertical jumps.
4. Keep shot markers and dose pills positioned from the exact existing on-board calculation rather than altering any shot data.
5. Keep “On board now” and “In 3.5 days” calculated directly with the same existing on-board function, preserving exact values and the current label text.

## Verification
- Confirm representative shot times evaluate to 0 contribution, full dose at 24 hours, and the expected five-day decay afterward.
- Confirm the chart path is smooth on phone and desktop widths, with no vertical segments or sharp polyline corners.
- Confirm saved shots and the JSON export shape remain unchanged after the chart update.
