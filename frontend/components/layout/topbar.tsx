import { ThemeToggle } from "@/components/layout/theme-toggle";

export function Topbar({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4 border-b border-border px-1 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-foreground-muted">{description}</p>
        </div>
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
