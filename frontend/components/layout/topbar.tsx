export function Topbar({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="text-sm uppercase tracking-[0.28em] text-cyan-300">Workspace</p>
        <h1 className="mt-3 font-[family:var(--font-heading)] text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">{description}</p>
      </div>
    </div>
  );
}
