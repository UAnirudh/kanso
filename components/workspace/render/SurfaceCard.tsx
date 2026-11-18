import type { ReactNode } from "react";

export function SurfaceCard({
  title,
  badge,
  actions,
  children,
  flush = false,
  label,
}: {
  title?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  label?: string;
}) {
  const heading = title || label;
  return (
    <section className="card-surface h-full" aria-label={heading || "Panel"}>
      {(heading || actions) && (
        <header className="card-head">
          <h3 className="card-title min-w-0">
            <span className="truncate">{heading}</span>
            {badge}
          </h3>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "card-body"}>{children}</div>
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-[var(--s-border)] px-3 py-4 text-center">
      <p className="text-[11.5px] text-[var(--s-faint)]">{children}</p>
    </div>
  );
}
