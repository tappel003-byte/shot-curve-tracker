import { Link } from "@tanstack/react-router";

export function AppTabs() {
  const base =
    "flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors";
  return (
    <nav className="mx-auto mb-5 flex max-w-md gap-1 rounded-xl border border-border bg-card p-1">
      <Link to="/" className={base} activeProps={{ className: "bg-primary text-primary-foreground" }} inactiveProps={{ className: "text-muted-foreground" }}>
        Curve
      </Link>
      <Link to="/recon" className={base} activeProps={{ className: "bg-primary text-primary-foreground" }} inactiveProps={{ className: "text-muted-foreground" }}>
        Recon
      </Link>
    </nav>
  );
}
