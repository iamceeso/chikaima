import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  helper,
  trend,
}: {
  label: string;
  value: string | number;
  helper: string;
  trend?: string;
}) {
  return (
    <Card className="rounded-[1.5rem] bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        {trend ? (
          <span className="rounded-full border border-border bg-[var(--surface-raised)] px-3 py-1 text-[11px] font-medium text-foreground-muted">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-foreground-muted">{helper}</p>
    </Card>
  );
}
