export function Topbar({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 rounded-[1.5rem] border border-border bg-[var(--surface-raised)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Workspace</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground-muted">{description}</p>
        </div>
        <div className="rounded-2xl border border-border bg-[var(--surface-strong)] px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Status</p>
          <p className="mt-1 text-sm font-medium text-foreground">All systems ready</p>
        </div>
      </div>
    </div>
  );
}
