import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { AppTabs } from "@/components/app-tabs";
import {
  DRIFT_HOURS,
  fmtMg,
  loadShots,
  loadStart,
  newId,
  onBoard,
  saveShots,
  saveStart,
  curve as buildCurve,
  type Shot,
  type StartLevel,
} from "@/lib/shotcurve";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shot Curve — tirzepatide on-board tracker" },
      {
        name: "description",
        content:
          "Log a tirzepatide shot and see estimated mg on board. Peak ~24h, half-life 5 days. Private: data stays on this device.",
      },
      { property: "og:title", content: "Shot Curve — tirzepatide on-board tracker" },
      {
        property: "og:description",
        content:
          "Log a tirzepatide shot and see estimated mg on board. Peak ~24h, half-life 5 days. Private: data stays on this device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShotCurve,
});

function toLocalInputValue(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// 6 mg = 25 units, 12 mg = 50 units
function unitsFor(mg: number): string {
  const u = (mg * 25) / 6;
  return Number.isInteger(u) ? String(u) : u.toFixed(1);
}


const SIDES = ["Left", "Right"];
const AREAS = ["Stomach", "Thigh", "Arm"];
const ZONES = ["Upper", "Middle", "Lower"];

function SiteChips({
  options,
  value,
  onPick,
}: {
  options: string[];
  value: string | null;
  onPick: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(value === o ? null : o)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function ShotCurve() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [start, setStart] = useState<StartLevel | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const initial = toLocalInputValue(Date.now());
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [doseChoice, setDoseChoice] = useState<"6" | "12" | "custom">("6");
  const [customMg, setCustomMg] = useState("");
  const [siteSide, setSiteSide] = useState<string | null>(null);
  const [siteArea, setSiteArea] = useState<string | null>(null);
  const [siteZone, setSiteZone] = useState<string | null>(null);

  // starting level form state
  const [startMg, setStartMg] = useState("");
  const [startDate, setStartDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.time);

  const [importError, setImportError] = useState("");
  const [importOk, setImportOk] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const [showStartForm, setShowStartForm] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState<Scale>("1W");
  const [schedule, setSchedule] = useState<{ days: number; mg: number | null }>({
    days: DRIFT_HOURS / 24,
    mg: null,
  });



  useEffect(() => {
    // one-time restore of the history lost when the home-screen shortcut was deleted
    const RESTORE_KEY = "shotcurve.restore.v1";
    if (!localStorage.getItem(RESTORE_KEY)) {
      localStorage.setItem(RESTORE_KEY, "done");
      if (loadShots().length === 0 && !loadStart()) {
        const t1 = new Date("2026-09-21T07:00").getTime();
        const t2 = new Date("2026-09-24T18:00").getTime();
        saveShots([
          { id: newId(), at: t1, mg: 12 },
          { id: newId(), at: t2, mg: 6 },
        ]);
        saveStart({ at: t1, mg: 4 });
      }
    }
    setShots(loadShots());
    const s = loadStart();
    setStart(s);
    setShowStartForm(false);
    if (s) {
      const v = toLocalInputValue(s.at);
      setStartMg(String(s.mg));
      setStartDate(v.date);
      setStartTime(v.time);
    }

    try {
      const r = JSON.parse(localStorage.getItem("shotcurve.recon.v1") ?? "null");
      const days = parseFloat(r?.scheduleDays);
      const mg = parseFloat(r?.wantedMg);
      setSchedule({
        days: Number.isFinite(days) && days > 0 ? days : DRIFT_HOURS / 24,
        mg: Number.isFinite(mg) && mg > 0 ? mg : null,
      });
    } catch {
      /* ignore */
    }
    const syncNow = () => setNow(Date.now());
    syncNow();
    setMounted(true);
    const id = setInterval(syncNow, 15_000);
    window.addEventListener("focus", syncNow);
    document.addEventListener("visibilitychange", syncNow);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", syncNow);
      document.removeEventListener("visibilitychange", syncNow);
    };
  }, []);

  const persist = (next: Shot[]) => {
    const sorted = [...next].sort((a, b) => a.at - b.at);
    setShots(sorted);
    saveShots(sorted);
  };

  const startMgNum = parseFloat(startMg);
  const startValid =
    !!startDate && !!startTime && Number.isFinite(startMgNum) && startMgNum > 0;

  const saveStartLevel = () => {
    if (!startValid) return;
    const at = new Date(`${startDate}T${startTime}`).getTime();
    if (!Number.isFinite(at)) return;
    const next = { at, mg: startMgNum };
    setStart(next);
    saveStart(next);
    setShowStartForm(false);
  };

  const clearStartLevel = () => {
    setStart(null);
    saveStart(null);
    setStartMg("");
    const v = toLocalInputValue(Date.now());
    setStartDate(v.date);
    setStartTime(v.time);
    setShowStartForm(false);
  };

  const closeStartForm = () => {
    if (start) {
      clearStartLevel();
    } else {
      setShowStartForm(false);
      setStartMg("");
      const v = toLocalInputValue(Date.now());
      setStartDate(v.date);
      setStartTime(v.time);
    }
  };

  const resetForm = () => {
    const v = toLocalInputValue(Date.now());
    setDate(v.date);
    setTime(v.time);
    setDoseChoice("6");
    setCustomMg("");
    setSiteSide(null);
    setSiteArea(null);
    setSiteZone(null);
    setEditingId(null);
  };

  const mg = doseChoice === "custom" ? parseFloat(customMg) : parseFloat(doseChoice);
  const formValid = !!date && !!time && Number.isFinite(mg) && mg > 0;
  const lastSite = [...shots].reverse().find((s) => s.site)?.site;

  const submit = () => {
    if (!formValid) return;
    const at = new Date(`${date}T${time}`).getTime();
    if (!Number.isFinite(at)) return;
    const siteParts = [siteSide, siteArea, siteZone].filter(Boolean);
    const site = siteParts.length ? siteParts.join(" · ") : undefined;
    if (editingId) {
      persist(shots.map((s) => (s.id === editingId ? { ...s, at, mg, site } : s)));
    } else {
      persist([...shots, { id: newId(), at, mg, site }]);
    }
    resetForm();
  };

  const startEdit = (s: Shot) => {
    const v = toLocalInputValue(s.at);
    setDate(v.date);
    setTime(v.time);
    if (s.mg === 6 || s.mg === 12) {
      setDoseChoice(String(s.mg) as "6" | "12");
      setCustomMg("");
    } else {
      setDoseChoice("custom");
      setCustomMg(String(s.mg));
    }
    const parts = s.site?.split(" · ") ?? [];
    setSiteSide(parts[0] ?? null);
    setSiteArea(parts[1] ?? null);
    setSiteZone(parts[2] ?? null);
    setEditingId(s.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = (id: string) => persist(shots.filter((s) => s.id !== id));

  const exportJson = () => {
    let recon: unknown = null;
    try {
      recon = JSON.parse(localStorage.getItem("shotcurve.recon.v1") ?? "null");
    } catch {
      /* ignore */
    }
    const payload = { app: "shot-curve", version: 1, shots, recon, start };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shot-curve-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    setImportError("");
    setImportOk("");
    try {
      const parsed = JSON.parse(await file.text());
      const rawShots = Array.isArray(parsed) ? parsed : parsed?.shots;
      if (!Array.isArray(rawShots)) throw new Error("not an array");
      const clean: Shot[] = [];
      for (const s of rawShots) {
        if (s && typeof s.at === "number" && typeof s.mg === "number" && s.mg > 0) {
          clean.push({ id: typeof s.id === "string" ? s.id : newId(), at: s.at, mg: s.mg });
        }
      }
      persist(clean);
      setImportOk(
        clean.length
          ? `Imported ${clean.length} shot${clean.length === 1 ? "" : "s"}.`
          : "File read, but it had no shots in it."
      );
      const s = parsed?.start;
      if (s && typeof s.at === "number" && typeof s.mg === "number" && s.mg > 0) {
        const next = { at: s.at, mg: s.mg };
        setStart(next);
        saveStart(next);
        setShowStartForm(false);
        const v = toLocalInputValue(next.at);
        setStartMg(String(next.mg));
        setStartDate(v.date);
        setStartTime(v.time);
      }
      const recon = parsed?.recon;
      if (
        recon &&
        typeof recon.vialMg === "string" &&
        typeof recon.bacMl === "string" &&
        typeof recon.wantedMg === "string"
      ) {
        localStorage.setItem("shotcurve.recon.v1", JSON.stringify(recon));
      }
    } catch {
      setImportError("That file doesn't look like a Shot Curve export.");
    }
  };

  const nowMg = onBoard(shots, now, start);
  const driftMg = onBoard(shots, now + DRIFT_HOURS * 3_600_000, start);

  const lastShot = shots.length ? shots[shots.length - 1] : null;
  const intervalHours = schedule.days > 0 ? schedule.days * 24 : DRIFT_HOURS;
  const nextAt = lastShot ? lastShot.at + intervalHours * 3_600_000 : null;
  const nextMg = schedule.mg ?? lastShot?.mg ?? 6;



  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-6">
      <AppTabs />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Shot Curve</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Estimate. Peak ~24h. Half-life 5 days. Not a lab value.
        </p>
      </header>

      {/* Big numbers */}
      <section className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            On board now
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-primary">
            {fmtMg(nowMg)}
            <span className="ml-1 text-sm font-medium text-muted-foreground">mg</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In 3.5 days
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-foreground">
            {fmtMg(driftMg)}
            <span className="ml-1 text-sm font-medium text-muted-foreground">mg</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">if nothing else is taken</div>
        </div>
      </section>

      {/* Next shot pill — read-only reminder of the scheduled shot */}
      {mounted && nextAt !== null && (
        <div className="mb-6 flex w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">Next</span>
          <span className="font-medium text-foreground">
            {new Date(nextAt).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <span className="ml-auto shrink-0 font-semibold text-primary">
            {fmtMg(nextMg)} mg · {unitsFor(nextMg)} u
          </span>
        </div>
      )}


      {mounted ? (
        <Chart shots={shots} now={now} start={start} scale={scale} onScaleChange={setScale} />
      ) : (
        <div className="h-[220px] rounded-xl border border-border bg-card" />
      )}


      {/* Log form */}
      <section ref={formRef} className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {editingId ? "Edit shot" : "Log a shot"}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <DoseButton active={doseChoice === "6"} onClick={() => setDoseChoice("6")} label="6 mg" sub="25 units" />
          <DoseButton active={doseChoice === "12"} onClick={() => setDoseChoice("12")} label="12 mg" sub="50 units" />
          <DoseButton
            active={doseChoice === "custom"}
            onClick={() => setDoseChoice("custom")}
            label="Custom"
            sub="mg"
          />
        </div>
        {doseChoice === "custom" && (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-muted-foreground">Custom dose (mg)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={customMg}
              onChange={(e) => setCustomMg(e.target.value)}
              placeholder="e.g. 7.5"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        )}

        <div className="mt-4 space-y-2.5">
          {lastSite && (
            <p className="text-xs text-muted-foreground">
              Last site: <span className="font-medium text-foreground">{lastSite}</span>
            </p>
          )}
          <div>
            <span className="mb-1 block text-xs text-muted-foreground">Side</span>
            <SiteChips options={SIDES} value={siteSide} onPick={setSiteSide} />
          </div>
          <div>
            <span className="mb-1 block text-xs text-muted-foreground">Area</span>
            <SiteChips options={AREAS} value={siteArea} onPick={setSiteArea} />
          </div>
          <div>
            <span className="mb-1 block text-xs text-muted-foreground">Zone</span>
            <SiteChips options={ZONES} value={siteZone} onPick={setSiteZone} />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={submit}
            disabled={!formValid}
            className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {editingId ? "Save changes" : "Save shot"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground"
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      {/* Shot history */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Logged shots</h2>
        {shots.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No shots yet. Log your first one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {[...shots].reverse().map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{fmtMg(s.mg)} mg</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.at).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {s.site ? ` · ${s.site}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(s)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Export / Import */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Your data</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Stored only on this device. Export before switching phones or clearing browser data.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={exportJson}
            className="rounded-lg bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground"
          >
            Export JSON
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground"
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = "";
            }}
          />
        </div>
        {importError && <p className="mt-2 text-xs text-destructive">{importError}</p>}
        {importOk && <p className="mt-2 text-xs text-primary">{importOk}</p>}
      </section>

      {/* Starting level */}
      <section className="mt-6 rounded-xl border border-dashed border-border bg-card p-3">
        {!showStartForm ? (
          start ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                Starting level: <span className="font-medium text-foreground">{fmtMg(start.mg)} mg</span> at{" "}
                {new Date(start.at).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <button
                onClick={() => setShowStartForm(true)}
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground"
              >
                Edit
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowStartForm(true)}
              className="w-full rounded-md border border-border py-2 text-xs font-medium text-foreground"
            >
              Set starting level
            </button>
          )
        ) : (
          <>
            <div className="mb-1 flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Starting level (one-time)</h2>
              <button
                onClick={closeStartForm}
                className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label={start ? "Remove starting level" : "Cancel"}
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              If you were already on it before logging here, enter roughly how many mg were on board and
              when. It decays like everything else.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">mg</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={startMg}
                  onChange={(e) => setStartMg(e.target.value)}
                  placeholder="e.g. 8"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Time</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
            </div>
            <div className="mt-3">
              <button
                onClick={saveStartLevel}
                disabled={!startValid}
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {start ? "Update starting level" : "Set starting level"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DoseButton({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2.5 text-center transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground"
      }`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className={`text-[11px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{sub}</div>
    </button>
  );
}

type Scale = "1W" | "1M" | "3M" | "All";
const SCALES: Scale[] = ["1W", "1M", "3M", "All"];
const SCALE_DAYS: Record<Exclude<Scale, "All">, number> = { "1W": 7, "1M": 30, "3M": 90 };

type SvgPoint = { x: number; y: number };

/** Monotone cubic interpolation keeps the sampled curve smooth without overshooting its values. */
function monotonePath(points: SvgPoint[]): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    if (!next) return 0;
    return (next.y - point.y) / (next.x - point.x);
  });
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0] ?? 0;
    if (index === points.length - 1) return slopes[slopes.length - 1] ?? 0;
    const before = slopes[index - 1] ?? 0;
    const after = slopes[index] ?? 0;
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) return 0;
    return (2 * before * after) / (before + after);
  });

  let path = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    if (!point || !next) continue;
    const third = (next.x - point.x) / 3;
    const startTangent = tangents[index] ?? 0;
    const endTangent = tangents[index + 1] ?? 0;
    path += ` C ${(point.x + third).toFixed(2)} ${(point.y + startTangent * third).toFixed(2)}, ${(next.x - third).toFixed(2)} ${(next.y - endTangent * third).toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

function Chart({
  shots,
  now,
  start,
  scale,
  onScaleChange,
}: {
  shots: Shot[];
  now: number;
  start: StartLevel | null;
  scale: Scale;
  onScaleChange: (s: Scale) => void;
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
    const x = (t: number) => PAD.left + ((t - from) / (to - from)) * (W - PAD.left - PAD.right);
    const y = (mg: number) => PAD.top + (1 - mg / maxMg) * (H - PAD.top - PAD.bottom);
    return { pts, from, to, maxMg, x, y };
  }, [shots, now, start, scale]);


  const { pts, from, to, maxMg, x, y } = model;
  const line = monotonePath(pts.map((point) => ({ x: x(point.t), y: y(point.mg) })));
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
