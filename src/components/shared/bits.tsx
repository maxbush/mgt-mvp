import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Phone } from "lucide-react";
import { toast } from "sonner";
import type { EntityStatus } from "@/lib/types";
import { cn, copyToClipboard, formatPhone, monthLabel, shiftMonth, telHref } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/misc";

/* ---------- Status badge ---------- */
export function StatusBadge({ status, className }: { status: EntityStatus | "draft" | "signed" | "closed" | "terminated"; className?: string }) {
  const map = {
    active: { label: "Активный", variant: "success" as const },
    inactive: { label: "Неактивный", variant: "muted" as const },
    draft: { label: "Черновик", variant: "warning" as const },
    signed: { label: "Подписан", variant: "success" as const },
    closed: { label: "Завершён", variant: "muted" as const },
    terminated: { label: "Расторгнут", variant: "destructive" as const },
  };
  const m = map[status];
  return (
    <Badge variant={m.variant} dot className={className}>
      {m.label}
    </Badge>
  );
}

/* ---------- Phone link ---------- */
export function PhoneLink({ phone, className, compact }: { phone: string; className?: string; compact?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  if (!phone) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("group/phone inline-flex items-center gap-1", className)} onClick={(e) => e.stopPropagation()}>
      <a href={telHref(phone)} className="tabular text-foreground underline-offset-2 hover:text-primary hover:underline whitespace-nowrap">
        {formatPhone(phone)}
      </a>
      {!compact && (
        <Tooltip content={copied ? "Скопировано" : "Скопировать"}>
          <button
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/phone:opacity-100 focus:opacity-100"
            onClick={async () => {
              await copyToClipboard(formatPhone(phone));
              setCopied(true);
              toast.success("Телефон скопирован");
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </button>
        </Tooltip>
      )}
    </span>
  );
}

export function PhoneButton({ phone }: { phone: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={telHref(phone)}>
        <Phone /> {formatPhone(phone)}
      </a>
    </Button>
  );
}

/* ---------- KPI card ---------- */
export function KpiCard({
  title,
  value,
  sub,
  delta,
  deltaLabel,
  icon,
  tone = "default",
  index = 0,
  onClick,
  loading,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number;
  deltaLabel?: string;
  icon?: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
  index?: number;
  onClick?: () => void;
  loading?: boolean;
}) {
  const toneCls = {
    default: "bg-muted text-foreground/70",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/20 text-amber-700 dark:text-amber-300",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
      whileHover={onClick ? { y: -2 } : undefined}
    >
      <Card className={cn("relative overflow-hidden p-4 transition-shadow", onClick && "cursor-pointer hover:shadow-float")} onClick={onClick}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12.5px] font-medium text-muted-foreground">{title}</p>
          {icon && <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", toneCls)}>{icon}</div>}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular">{value}</div>
        )}
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {delta !== undefined && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium tabular", delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
              {delta > 0 ? <ArrowUpRight className="size-3.5" /> : delta < 0 ? <ArrowDownRight className="size-3.5" /> : null}
              {delta > 0 ? "+" : ""}
              {delta}
              {deltaLabel}
            </span>
          )}
          {sub && <span className="truncate">{sub}</span>}
        </div>
      </Card>
    </motion.div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-[12px] text-muted-foreground">{breadcrumb}</div>}
        <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Month picker ---------- */
export function MonthPicker({
  value,
  onChange,
  min,
  max = "2027-08",
  className,
}: {
  value: string;
  onChange: (m: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex h-8 items-center rounded-md border border-border bg-card shadow-soft", className)}>
      <button
        className="flex h-full items-center px-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        onClick={() => onChange(shiftMonth(value, -1))}
        disabled={!!min && shiftMonth(value, -1) < min}
        aria-label="Предыдущий месяц"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-[7.5rem] select-none text-center text-[13px] font-medium capitalize">{monthLabel(value)}</span>
      <button
        className="flex h-full items-center px-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={!!max && shiftMonth(value, 1) > max}
        aria-label="Следующий месяц"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/* ---------- Section / description list ---------- */
export function Section({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DL({ items, cols = 2 }: { items: { label: string; value: React.ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", cols === 1 && "grid-cols-1", cols === 2 && "grid-cols-1 sm:grid-cols-2", cols === 3 && "grid-cols-1 sm:grid-cols-3")}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-[13px] break-words">{it.value || <span className="text-muted-foreground">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Money({ value, className, colored }: { value: number; className?: string; colored?: boolean }) {
  const neg = value < 0;
  const s = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return (
    <span className={cn("tabular whitespace-nowrap", colored && neg && "text-destructive font-medium", colored && value > 0 && "text-foreground", className)}>
      {s}
      <span className="ml-1 text-muted-foreground text-[0.85em]">Br</span>
    </span>
  );
}

/* ---------- Page skeleton ---------- */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5 animate-in fade-in-0">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

export function useFakeLoading(ms = 350) {
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}
