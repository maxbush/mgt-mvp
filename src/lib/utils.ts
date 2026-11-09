import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------- Money ---------- */
const moneyFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number, withCurrency = true): string {
  const s = moneyFmt.format(Math.round(value * 100) / 100).replace(/\u00a0/g, "\u202f");
  return withCurrency ? `${s}\u00a0Br` : s;
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ---------- Dates ---------- */
export function toDate(d: string | Date): Date {
  return typeof d === "string" ? parseISO(d) : d;
}

export function formatDate(d: string | Date | undefined | null): string {
  if (!d) return "—";
  return format(toDate(d), "dd.MM.yyyy");
}

export function formatDateTime(d: string | Date): string {
  return format(toDate(d), "dd.MM.yyyy HH:mm");
}

export function formatDayShort(d: string | Date): string {
  return format(toDate(d), "d MMM", { locale: ru }).replace(".", "");
}

export function weekdayShort(d: string | Date): string {
  return format(toDate(d), "EEEEEE", { locale: ru });
}

export function monthKey(d: string | Date): string {
  return format(toDate(d), "yyyy-MM");
}

export function monthLabel(key: string, genitive = false): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  const label = genitive
    ? format(date, "LLLL yyyy", { locale: ru })
    : format(date, "LLLL yyyy", { locale: ru });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** «за февраль 2026 г.» */
export function monthGenitive(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  return `${format(date, "MMMM", { locale: ru })} ${y} г.`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return format(d, "yyyy-MM");
}

export function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/* ---------- Names ---------- */
export interface HasName {
  lastName: string;
  firstName: string;
  middleName: string;
}

export function fullName(p: HasName): string {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
}

export function shortName(p: HasName): string {
  const i1 = p.firstName ? `${p.firstName[0]}.` : "";
  const i2 = p.middleName ? `${p.middleName[0]}.` : "";
  return `${p.lastName} ${i1}${i2}`.trim();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** «3» → «3 кл.», «6 лет» и «3А(1)» — как есть */
export function gradeLabel(grade: string): string {
  return /^\d+$/.test(String(grade).trim()) ? `${grade} кл.` : String(grade);
}

/* ---------- Phones ---------- */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("375")) {
    return `+375 (${digits.slice(3, 5)}) ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10, 12)}`;
  }
  return raw;
}

export function telHref(raw: string): string {
  return `tel:+${raw.replace(/\D/g, "")}`;
}

/* ---------- Misc ---------- */
export function uid(prefix = ""): string {
  const s = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}_${s}` : s;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function maskValue(value: string, visible = 4): string {
  if (!value) return "";
  const clean = value.replace(/\s/g, "");
  if (clean.length <= visible) return "•".repeat(clean.length);
  return "•".repeat(Math.min(clean.length - visible, 12)) + clean.slice(-visible);
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function sumBy<T>(arr: T[], fn: (t: T) => number): number {
  return arr.reduce((acc, x) => acc + fn(x), 0);
}

export function groupBy<T, K extends string | number>(arr: T[], fn: (t: T) => K): Record<K, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = fn(item);
      (acc[k] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function compareRu(a: string, b: string) {
  return a.localeCompare(b, "ru");
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
