export function Topbar({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 border-b border-border px-1 pb-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Workspace</p>
        <h1 className="mt-2 font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-zinc-400">{description}</p>
      </div>
    </div>
  );
}
