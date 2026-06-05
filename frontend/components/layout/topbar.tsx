export function Topbar({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 border-b border-border px-2 pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Workspace</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground-muted">{description}</p>
        </div>
        <div className="rounded-full border border-border bg-surface px-4 py-2.5 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Status</p>
          <p className="mt-1 text-sm font-medium text-foreground">All systems ready</p>
        </div>
      </div>
    </div>
  );
}
