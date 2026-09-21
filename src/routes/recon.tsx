import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppTabs } from "@/components/app-tabs";

export const Route = createFileRoute("/recon")({
  head: () => ({
    meta: [
      { title: "Recon — Shot Curve" },
      {
        name: "description",
        content: "Reconstitution math: mg/mL, units to pull on a U-100 syringe, and doses per vial.",
      },
      { property: "og:title", content: "Recon — Shot Curve" },
      {
        property: "og:description",
        content: "Reconstitution math: mg/mL, units to pull on a U-100 syringe, and doses per vial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Recon,
});

const RECON_KEY = "shotcurve.recon.v1";

type ReconState = {
  vialMg: string;
  bacMl: string;
  wantedMg: string;
};

const DEFAULTS: ReconState = { vialMg: "36", bacMl: "1.5", wantedMg: "6" };


function loadRecon(): ReconState {
  try {
    const raw = localStorage.getItem(RECON_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    if (p && typeof p.vialMg === "string" && typeof p.bacMl === "string" && typeof p.wantedMg === "string") {
      return p;
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

function Recon() {
  const [state, setState] = useState<ReconState>(DEFAULTS);

  useEffect(() => {
    setState(loadRecon());
  }, []);

  const update = (patch: Partial<ReconState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(RECON_KEY, JSON.stringify(next));
      return next;
    });
  };

  const vial = parseFloat(state.vialMg);
  const bac = parseFloat(state.bacMl);
  const wanted = parseFloat(state.wantedMg);
  const valid = vial > 0 && bac > 0 && wanted > 0;

  const conc = valid ? vial / bac : NaN; // mg/mL
  const units = valid ? (wanted / conc) * 100 : NaN; // U-100 units
  const ml = valid ? units / 100 : NaN;
  const fullDoses = valid ? Math.floor(vial / wanted) : NaN;

  const fmt = (n: number, digits = 2) =>
    Number.isFinite(n) ? parseFloat(n.toFixed(digits)).toString() : "—";

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-6">
      <AppTabs />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Recon</h1>
        <p className="mt-1 text-xs text-muted-foreground">U-100 syringe: 100 units = 1 mL.</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Vial (mg peptide)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={state.vialMg}
              onChange={(e) => update({ vialMg: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">BAC water (mL)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={state.bacMl}
              onChange={(e) => update({ bacMl: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        <div className="mt-4">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Wanted dose (mg)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={state.wantedMg}
              onChange={(e) => update({ wantedMg: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>
      </section>

      {/* Results */}
      <section className="mt-4 space-y-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Units to pull</div>
          <div className="mt-1 text-5xl font-bold tabular-nums text-primary">{fmt(units, 1)}</div>
          <div className="text-sm text-muted-foreground">units</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">mg/mL</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{fmt(conc, 1)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">mL to pull</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{fmt(ml, 3)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Full doses</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
              {Number.isFinite(fullDoses) ? fullDoses : "—"}
            </div>
          </div>
        </div>
        {valid && (
          <p className="text-center text-xs text-muted-foreground">
            {fmt(vial)} mg in {fmt(bac)} mL → {fmt(conc, 1)} mg/mL · {fmt(units, 1)} units = {fmt(wanted)} mg
          </p>
        )}
      </section>
    </div>
  );
}
