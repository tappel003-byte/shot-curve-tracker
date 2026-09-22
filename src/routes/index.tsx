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

  // starting level form state
  const [startMg, setStartMg] = useState("");
  const [startDate, setStartDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.time);

  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [showStartForm, setShowStartForm] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
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
    setNow(Date.now());
    setMounted(true);
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
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

  const resetForm = () => {
    const v = toLocalInputValue(Date.now());
    setDate(v.date);
    setTime(v.time);
    setDoseChoice("6");
    setCustomMg("");
    setEditingId(null);
  };

  const mg = doseChoice === "custom" ? parseFloat(customMg) : parseFloat(doseChoice);
  const formValid = !!date && !!time && Number.isFinite(mg) && mg > 0;

  const submit = () => {
    if (!formValid) return;
    const at = new Date(`${date}T${time}`).getTime();
    if (!Number.isFinite(at)) return;
    if (editingId) {
      persist(shots.map((s) => (s.id === editingId ? { ...s, at, mg } : s)));
    } else {
      persist([...shots, { id: newId(), at, mg }]);
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

      {mounted ? (
        <Chart shots={shots} now={now} start={start} />
      ) : (
        <div className="h-[220px] rounded-xl border border-border bg-card" />
      )}

      {/* Log form */}
      <section className="mt-6 rounded-xl border border-border bg-card p-4">
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
            <h2 className="mb-1 text-sm font-semibold text-foreground">Starting level (one-time)</h2>
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
            <div className="mt-3 flex gap-2">
              <button
                onClick={saveStartLevel}
                disabled={!startValid}
                className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {start ? "Update starting level" : "Set starting level"}
              </button>
              {start && (
                <button
                  onClick={clearStartLevel}
                  className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-destructive"
                >
                  Remove
                </button>
              )}
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

function Chart({ shots, now, start }: { shots: Shot[]; now: number; start: StartLevel | null }) {
  const W = 360;
  const H = 200;
  const PAD = { top: 12, right: 10, bottom: 22, left: 34 };

  const model = useMemo(() => {
    const to = now + DRIFT_HOURS * 3_600_000;
    const earliest = Math.min(shots[0]?.at ?? now, start?.at ?? now);
    const from = Math.min(earliest, now - 3 * 86_400_000);
    const step = Math.max((to - from) / 240, 3_600_000);
    const pts = buildCurve(shots, from, to, step, start);
    const maxMg = Math.max(1, ...pts.map((p) => p.mg));
    const x = (t: number) => PAD.left + ((t - from) / (to - from)) * (W - PAD.left - PAD.right);
    const y = (mg: number) => PAD.top + (1 - mg / maxMg) * (H - PAD.top - PAD.bottom);
    return { pts, from, to, maxMg, x, y };
  }, [shots, now, start]);

  const { pts, from, to, maxMg, x, y } = model;
  const line = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.mg).toFixed(1)}`).join(" ");
  const nowY = y(onBoard(shots, now, start));

  // ~5 date ticks
  const ticks: number[] = [];
  const tickStep = (to - from) / 4;
  for (let i = 0; i <= 4; i++) ticks.push(from + i * tickStep);

  return (
    <section className="rounded-xl border border-border bg-card p-3">
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
          <polyline points={line} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinejoin="round" />
        )}
        {/* shot marks */}
        {shots.map((s) => (
          <g key={s.id}>
            <line
              x1={x(s.at)}
              x2={x(s.at)}
              y1={H - PAD.bottom}
              y2={H - PAD.bottom + 6}
              className="stroke-accent-foreground"
              strokeWidth="1.5"
            />
            <circle cx={x(s.at)} cy={y(onBoard(shots, s.at, start))} r="3.5" className="fill-primary" />
          </g>
        ))}
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
