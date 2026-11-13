import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  WEIGHT_OPEN_KEY,
  defaultWeighDate,
  dismissFridayWeighPrompt,
  loadUiOpen,
  newId,
  saveUiOpen,
  saveWeights,
  shouldPromptFridayWeigh,
  toISODateLocal,
  type WeightEntry,
} from "@/lib/shotcurve";

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function fmtLbs(lbs: number): string {
  return Number.isInteger(lbs) ? String(lbs) : lbs.toFixed(1);
}

function fmtEntryDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function WeightSparkline({ entries }: { entries: WeightEntry[] }) {
  if (entries.length < 2) return null;
  const W = 120;
  const H = 28;
  const pad = 2;
  const lbs = entries.map((e) => e.lbs);
  const min = Math.min(...lbs);
  const max = Math.max(...lbs);
  const span = Math.max(0.5, max - min);
  const pts = entries.map((e, i) => {
    const x = pad + (i / (entries.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (e.lbs - min) / span) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-7 w-[7.5rem] shrink-0"
      role="img"
      aria-label="Weight trend"
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        className="stroke-primary"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WeightTracker({
  entries,
  onChange,
}: {
  entries: WeightEntry[];
  onChange: (next: WeightEntry[]) => void;
}) {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [date, setDate] = useState(() => defaultWeighDate());
  const [lbs, setLbs] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [promptGone, setPromptGone] = useState(false);

  useEffect(() => {
    setSectionOpen(loadUiOpen(WEIGHT_OPEN_KEY, false));
    setPrefsReady(true);
  }, []);

  const setSectionExpanded = (next: boolean) => {
    setSectionOpen(next);
    saveUiOpen(WEIGHT_OPEN_KEY, next);
  };

  const lbsNum = parseFloat(lbs);
  const formValid = !!date && Number.isFinite(lbsNum) && lbsNum > 0 && lbsNum < 1000;
  const showPrompt = !promptGone && shouldPromptFridayWeigh(entries);
  const loggedDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);
  const latest = entries.length ? entries[entries.length - 1] : null;
  const selected = parseLocalDate(date);

  const persist = (next: WeightEntry[]) => {
    const sorted = [...next].sort((a, b) => a.date.localeCompare(b.date));
    saveWeights(sorted);
    onChange(sorted);
  };

  const resetForm = (preferDate?: string) => {
    setDate(preferDate ?? defaultWeighDate());
    setLbs("");
    setEditingId(null);
  };

  const submit = () => {
    if (!formValid) return;
    if (editingId) {
      persist(entries.map((e) => (e.id === editingId ? { ...e, date, lbs: lbsNum } : e)));
    } else {
      const existing = entries.find((e) => e.date === date);
      if (existing) {
        persist(entries.map((e) => (e.id === existing.id ? { ...e, lbs: lbsNum } : e)));
      } else {
        persist([...entries, { id: newId(), date, lbs: lbsNum }]);
      }
    }
    resetForm(date);
  };

  const startEdit = (e: WeightEntry) => {
    setSectionExpanded(true);
    setFormOpen(true);
    setEditingId(e.id);
    setDate(e.date);
    setLbs(String(e.lbs));
  };

  const remove = (id: string) => {
    persist(entries.filter((e) => e.id !== id));
    if (editingId === id) resetForm();
  };

  const dismissPrompt = () => {
    dismissFridayWeighPrompt();
    setPromptGone(true);
  };

  const openToLog = () => {
    setSectionExpanded(true);
    setFormOpen(true);
    resetForm(defaultWeighDate());
  };

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => setSectionExpanded(!sectionOpen)}
        aria-expanded={sectionOpen}
        aria-controls="weight-section-body"
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Weight{" "}
            <span className="font-medium text-muted-foreground">(optional)</span>
          </h2>
          {sectionOpen ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Friday weigh-ins · lbs · stays on this device
            </p>
          ) : latest ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmtLbs(latest.lbs)} lb · {fmtEntryDate(latest.date)}
              {entries.length > 1 ? ` · ${entries.length} entries` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">No weigh-ins yet</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {latest && (
            <>
              <WeightSparkline entries={entries} />
              {sectionOpen && (
                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {fmtLbs(latest.lbs)}
                    <span className="ml-0.5 text-xs font-medium text-muted-foreground">lb</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{fmtEntryDate(latest.date)}</div>
                </div>
              )}
            </>
          )}
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
              sectionOpen ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </div>
      </button>

      {showPrompt && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Friday weigh-in? Optional — doesn’t block logging shots.
          </p>
          <button
            type="button"
            onClick={openToLog}
            className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
          >
            Log
          </button>
          <button
            type="button"
            onClick={dismissPrompt}
            className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            Skip
          </button>
        </div>
      )}

      {prefsReady && sectionOpen && (
        <div id="weight-section-body" className="mt-3">
          {!formOpen ? (
            <button
              type="button"
              onClick={openToLog}
              className="w-full rounded-md border border-border py-2 text-xs font-medium text-foreground"
            >
              {entries.length ? "Log or edit weigh-in" : "Log a weigh-in"}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="mb-1 block text-xs text-muted-foreground">Date</span>
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-foreground"
                      >
                        {fmtEntryDate(date)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selected}
                        defaultMonth={selected}
                        onSelect={(d) => {
                          if (!d) return;
                          setDate(toISODateLocal(d));
                          setCalOpen(false);
                        }}
                        modifiers={{
                          weighed: (d) => loggedDates.has(toISODateLocal(d)),
                          friday: (d) => d.getDay() === 5,
                        }}
                        modifiersClassNames={{
                          weighed: "font-semibold text-primary",
                          friday: "underline decoration-muted-foreground/50 underline-offset-2",
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Weight (lbs)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={lbs}
                    onChange={(e) => setLbs(e.target.value)}
                    placeholder="e.g. 209"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={!formValid}
                  className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {editingId ? "Save weigh-in" : "Save weigh-in"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormOpen(false);
                  }}
                  className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {entries.length > 0 && (
            <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
              {[...entries].reverse().map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold tabular-nums text-foreground">
                      {fmtLbs(e.lbs)}{" "}
                      <span className="text-xs font-medium text-muted-foreground">lb</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{fmtEntryDate(e.date)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(e)}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-destructive"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
