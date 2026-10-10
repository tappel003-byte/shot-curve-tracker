import { useMemo } from "react";
import {
  DRIFT_HOURS,
  fmtMg,
  onBoard,
  curve as buildCurve,
  type Shot,
  type StartLevel,
} from "@/lib/shotcurve";

export type ChartScale = "1W" | "1M" | "3M" | "All";
const SCALES: ChartScale[] = ["1W", "1M", "3M", "All"];
const SCALE_DAYS: Record<Exclude<ChartScale, "All">, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
};

type SvgPoint = { x: number; y: number; t: number };

/** Hours of clearance around each extremum so cubic handles can form a visible shoulder. */
const SHOULDER_HOURS = 20;

/**
 * Display-only path refinement.
 *
 * Why the raw chart reads jagged (not a math bug):
 * - Samples are exact 2h `onBoard` knots connected with straight SVG `L` segments.
 * - The PK model has a derivative kink at the 24h peak, so polyline corners become
 *   sharp triangles at extrema — spreadsheet-plot energy, not bad half-life math.
 *
 * This builds a shape-preserving cubic Hermite path through a thinned knot set:
 * extrema keep horizontal tangents (rounded shoulders), harmonic-mean slopes avoid
 * overshoot, and nearby 2h samples are dropped so handles are long enough to see.
 * Markers, big numbers, dose math, and persisted data never use this path.
 */
export function smoothPath(samples: SvgPoint[]): string {
  const first = samples[0];
  if (!first) return "";
  if (samples.length === 1) return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  const turns = samples.filter((point, index) => {
    const before = samples[index - 1];
    const after = samples[index + 1];
    return !!before && !!after && (point.y - before.y) * (after.y - point.y) < 0;
  });

  const shoulderMs = SHOULDER_HOURS * 3_600_000;
  const points = samples.filter(
    (point, index) =>
      index === 0 ||
      index === samples.length - 1 ||
      turns.includes(point) ||
      turns.every((turn) => Math.abs(point.t - turn.t) >= shoulderMs),
  );

  const knot = points[0];
  if (!knot) return "";
  if (points.length === 1) return `M ${knot.x.toFixed(2)} ${knot.y.toFixed(2)}`;

  const slopes = points.slice(1).map((point, index) => {
    const previous = points[index];
    if (!previous || point.x === previous.x) return 0;
    return (point.y - previous.y) / (point.x - previous.x);
  });

  const tangents = points.map((_, index) => {
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before === undefined) return after ?? 0;
    if (after === undefined) return before;
    // Horizontal tangent at every peak/trough; harmonic mean avoids overshoot.
    if (before * after <= 0) return 0;
    return (2 * before * after) / (before + after);
  });

  let path = `M ${knot.x.toFixed(2)} ${knot.y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    if (!point || !next) continue;
    const handle = (next.x - point.x) / 3;
    const c1x = point.x + handle;
    const c1y = point.y + handle * (tangents[index] ?? 0);
    const c2x = next.x - handle;
    const c2y = next.y - handle * (tangents[index + 1] ?? 0);
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

export function ShotCurveChart({
  shots,
  now,
  start,
  scale,
  onScaleChange,
}: {
  shots: Shot[];
  now: number;
  start: StartLevel | null;
  scale: ChartScale;
  onScaleChange: (s: ChartScale) => void;
}) {
  const W = 360;
  const H = 200;
  const PAD = { top: 22, right: 10, bottom: 22, left: 34 };

  const model = useMemo(() => {
    const anchor = Math.min(shots[0]?.at ?? now, start?.at ?? now, now);
    // Start exactly at the first known level/shot. Padding before it creates a
    // false zero-level segment and makes the first date appear a day early.
    const from = anchor;
    const minTo = now + DRIFT_HOURS * 3_600_000;
    const to =
      scale === "All"
        ? Math.max(minTo, from + 14 * 86_400_000)
        : Math.max(minTo, from + SCALE_DAYS[scale] * 86_400_000);
    const pts = buildCurve(shots, from, to, 2 * 3_600_000, start);
    const maxMg = Math.max(1, ...pts.map((p) => p.mg));
    const x = (t: number) =>
      PAD.left + ((t - from) / (to - from)) * (W - PAD.left - PAD.right);
    const y = (mg: number) => PAD.top + (1 - mg / maxMg) * (H - PAD.top - PAD.bottom);
    return { pts, from, to, maxMg, x, y };
  }, [shots, now, start, scale]);

  const { pts, from, to, maxMg, x, y } = model;
  const line = smoothPath(pts.map((point) => ({ x: x(point.t), y: y(point.mg), t: point.t })));
  const nowY = y(onBoard(shots, now, start));

  // ~5 date ticks
  const ticks: number[] = [];
  const tickStep = (to - from) / 4;
  for (let i = 0; i <= 4; i++) ticks.push(from + i * tickStep);

  // dose badges: only on the closer scales, and only when marks aren't crowded
  const visible = shots.filter((s) => s.at >= from && s.at <= to);
  const showBadges =
    (scale === "1W" || scale === "1M") &&
    visible.every((s, i) => {
      const previous = visible[i - 1];
      return !previous || x(s.at) - x(previous.at) > 34;
    });

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex gap-1">
        {SCALES.map((s) => (
          <button
            key={s}
            onClick={() => onScaleChange(s)}
            className={`flex-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors ${
              s === scale
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Estimated mg on board over time">
        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const gy = y(maxMg * f);
          return (
            <g key={f}>
              <line x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} className="stroke-border" strokeWidth="1" />
              <text x={PAD.left - 5} y={gy + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9">
                {fmtMg(maxMg * f)}
              </text>
            </g>
          );
        })}
        {/* now line */}
        <line
          x1={x(now)}
          x2={x(now)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          className="stroke-muted-foreground"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {/* curve */}
        {(shots.length > 0 || start) && (
          <path
            d={line}
            fill="none"
            className="stroke-primary"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* shot marks */}
        {visible.map((s) => {
          const cx = x(s.at);
          const cy = y(onBoard(shots, s.at, start));
          const label = `${fmtMg(s.mg)} mg`;
          const bw = label.length * 5 + 8;
          const bx = Math.min(Math.max(cx - bw / 2, PAD.left), W - PAD.right - bw);
          const by = Math.max(cy - 26, 2);
          return (
            <g key={s.id}>
              <line
                x1={cx}
                x2={cx}
                y1={H - PAD.bottom}
                y2={H - PAD.bottom + 6}
                className="stroke-accent-foreground"
                strokeWidth="1.5"
              />
              <circle cx={cx} cy={cy} r="3.5" className="fill-primary" />
              {showBadges && (
                <g>
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height="13"
                    rx="6.5"
                    className="fill-card stroke-primary"
                    strokeWidth="1"
                  />
                  <text
                    x={bx + bw / 2}
                    y={by + 9.5}
                    textAnchor="middle"
                    className="fill-foreground"
                    fontSize="8.5"
                    fontWeight="600"
                  >
                    {label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* now dot */}
        {(shots.length > 0 || start) && <circle cx={x(now)} cy={nowY} r="4" className="fill-foreground" />}
        {/* x labels */}
        {ticks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="9"
          >
            {new Date(t).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>marks = shots</span>
        <span>dashed = now</span>
      </div>
    </section>
  );
}
