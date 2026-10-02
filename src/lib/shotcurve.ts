export type Shot = {
  id: string;
  /** epoch ms of the injection */
  at: number;
  /** dose in mg */
  mg: number;
  /** injection site, e.g. "Left · Stomach · Upper" */
  site?: string;
};

export const HALF_LIFE_HOURS = 120; // 5 days
export const PEAK_HOURS = 24;
export const DRIFT_HOURS = 84; // 3.5 days

/** mg contribution of a single shot at `hoursAfter` hours since injection */
export function contribution(mg: number, hoursAfter: number): number {
  if (hoursAfter < 0) return 0;
  if (hoursAfter < PEAK_HOURS) return mg * (hoursAfter / PEAK_HOURS);
  return mg * Math.pow(0.5, (hoursAfter - PEAK_HOURS) / HALF_LIFE_HOURS);
}

/** one-time assumed starting level: {at, mg} — decays with the half-life from `at` */
export type StartLevel = { at: number; mg: number };

export function startContribution(start: StartLevel | null, t: number): number {
  if (!start || t < start.at) return 0;
  return start.mg * Math.pow(0.5, (t - start.at) / 3_600_000 / HALF_LIFE_HOURS);
}

/** total mg on board from all shots (plus optional starting level) at time t (epoch ms) */
export function onBoard(shots: Shot[], t: number, start?: StartLevel | null): number {
  let total = startContribution(start ?? null, t);
  for (const s of shots) total += contribution(s.mg, (t - s.at) / 3_600_000);
  return total;
}

export type ChartPoint = { t: number; mg: number };

/** sampled curve from `from` to `to` */
export function curve(
  shots: Shot[],
  from: number,
  to: number,
  stepMs: number,
  start?: StartLevel | null,
): ChartPoint[] {
  const pts: ChartPoint[] = [];
  for (let t = from; t <= to; t += stepMs) {
    pts.push({ t, mg: onBoard(shots, t, start) });
  }
  const last = pts[pts.length - 1];
  if (!last || last.t < to) pts.push({ t: to, mg: onBoard(shots, to, start) });
  return pts;
}

export function fmtMg(mg: number): string {
  return mg >= 10 ? mg.toFixed(1) : mg.toFixed(2);
}

export const STORAGE_KEY = "shotcurve.shots.v1";
export const START_KEY = "shotcurve.start.v1";

export function loadStart(): StartLevel | null {
  try {
    const raw = localStorage.getItem(START_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && typeof s.at === "number" && typeof s.mg === "number" && s.mg > 0) {
      return { at: s.at, mg: s.mg };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStart(start: StartLevel | null) {
  if (start) localStorage.setItem(START_KEY, JSON.stringify(start));
  else localStorage.removeItem(START_KEY);
}

export function loadShots(): Shot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is Shot =>
          s &&
          typeof s.id === "string" &&
          typeof s.at === "number" &&
          typeof s.mg === "number" &&
          s.mg > 0 &&
          (s.site === undefined || typeof s.site === "string"),
      )
      .sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export function saveShots(shots: Shot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shots));
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
