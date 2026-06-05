import { Card } from "@/components/ui/card";

export function StatCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <Card className="bg-slate-950/50">
      <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">{label}</p>
      <p className="mt-4 text-4xl font-semibold">{value}</p>
      <p className="mt-3 text-sm text-slate-400">{helper}</p>
    </Card>
  );
}
