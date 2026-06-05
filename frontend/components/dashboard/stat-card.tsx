import { Card } from "@/components/ui/card";

export function StatCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <Card className="bg-[#40414f] p-5">
      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm text-zinc-400">{helper}</p>
    </Card>
  );
}
