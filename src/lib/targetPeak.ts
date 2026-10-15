import { PEAK_HOURS, onBoard, type Shot, type StartLevel } from "@/lib/shotcurve";

const HOUR_MS = 3_600_000;
const PEAK_MS = PEAK_HOURS * HOUR_MS;
/** Search window for a shoot time that lands peak near target. */
const MAX_WAIT_MS = 60 * 24 * HOUR_MS;

export type TargetPeakPlan = {
  /** Planned injection time (epoch ms). */
  shootAt: number;
  /** Predicted peak time = shootAt + 24h. */
  peakAt: number;
  /** Dose used for the plan. */
  doseMg: number;
  /** Desired peak mg. */
  targetMg: number;
  /** Residual on board at peak time (target − dose), clamped ≥ 0. */
  residualAtPeak: number;
  /** On-board level at shoot time — wait down to about this, then shoot. */
  waitUntilMg: number;
  /** Predicted peak if the dose is taken at shootAt. */
  predictedPeakMg: number;
  /** True when shooting now (or sooner) already lands at/under target. */
  takeNow: boolean;
  /** True when target is below the dose alone (even zero residual overshoots). */
  unreachable: boolean;
};

/**
 * Peak after a new dose D at tShot ≈ onBoard(shots, tShot + 24h) + D
 * (contribution at 24h equals the full dose). Solve for tShot so that ≈ target.
 */
export function planTargetPeak(
  shots: Shot[],
  start: StartLevel | null,
  now: number,
  targetMg: number,
  doseMg: number,
): TargetPeakPlan | null {
  if (!(targetMg > 0) || !(doseMg > 0) || !Number.isFinite(targetMg) || !Number.isFinite(doseMg)) {
    return null;
  }

  const residualNeeded = targetMg - doseMg;
  if (residualNeeded < 0) {
    return {
      shootAt: now,
      peakAt: now + PEAK_MS,
      doseMg,
      targetMg,
      residualAtPeak: 0,
      waitUntilMg: onBoard(shots, now, start),
      predictedPeakMg: onBoard(shots, now + PEAK_MS, start) + doseMg,
      takeNow: false,
      unreachable: true,
    };
  }

  const residualAt = (tShot: number) => onBoard(shots, tShot + PEAK_MS, start);
  const peakIfShotAt = (tShot: number) => residualAt(tShot) + doseMg;

  // Already at or under target if we shot now (residual decays monotonically without new shots).
  if (residualAt(now) <= residualNeeded + 1e-9) {
    const predictedPeakMg = peakIfShotAt(now);
    return {
      shootAt: now,
      peakAt: now + PEAK_MS,
      doseMg,
      targetMg,
      residualAtPeak: residualNeeded,
      waitUntilMg: onBoard(shots, now, start),
      predictedPeakMg,
      takeNow: true,
      unreachable: false,
    };
  }

  let lo = now;
  let hi = now + MAX_WAIT_MS;
  if (residualAt(hi) > residualNeeded) {
    // Still above after long wait — return the far end as best effort.
    const shootAt = hi;
    return {
      shootAt,
      peakAt: shootAt + PEAK_MS,
      doseMg,
      targetMg,
      residualAtPeak: residualNeeded,
      waitUntilMg: onBoard(shots, shootAt, start),
      predictedPeakMg: peakIfShotAt(shootAt),
      takeNow: false,
      unreachable: false,
    };
  }

  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (residualAt(mid) > residualNeeded) lo = mid;
    else hi = mid;
  }

  const shootAt = hi;
  return {
    shootAt,
    peakAt: shootAt + PEAK_MS,
    doseMg,
    targetMg,
    residualAtPeak: residualNeeded,
    waitUntilMg: onBoard(shots, shootAt, start),
    predictedPeakMg: peakIfShotAt(shootAt),
    takeNow: false,
    unreachable: false,
  };
}
