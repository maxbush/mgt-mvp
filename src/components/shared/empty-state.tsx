import * as React from "react";
import { cn } from "@/lib/utils";

function Illustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={cn("h-28 w-auto", className)} aria-hidden>
      <defs>
        <linearGradient id="es-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="104" rx="56" ry="8" fill="var(--muted)" />
      <rect x="32" y="22" width="96" height="68" rx="10" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="32" y="22" width="96" height="16" rx="10" fill="url(#es-g)" />
      <circle cx="44" cy="30" r="2.5" fill="var(--primary)" opacity="0.7" />
      <circle cx="52" cy="30" r="2.5" fill="var(--primary)" opacity="0.45" />
      <circle cx="60" cy="30" r="2.5" fill="var(--primary)" opacity="0.25" />
      <rect x="44" y="48" width="40" height="5" rx="2.5" fill="var(--border)" />
      <rect x="44" y="60" width="64" height="5" rx="2.5" fill="var(--border)" opacity="0.7" />
      <rect x="44" y="72" width="52" height="5" rx="2.5" fill="var(--border)" opacity="0.5" />
      <circle cx="112" cy="76" r="14" fill="var(--card)" stroke="var(--primary)" strokeWidth="2" />
      <path d="M122 86l10 10" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
      <path d="M106 76h12M112 70v12" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-6 py-10" : "px-6 py-16", className)}>
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      ) : (
        <Illustration className={cn("mb-3", compact && "h-20")} />
      )}
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
    </div>
  );
}
