/**
 * РАСЧЁТЫ ДЕНЕГ — чистые функции без доступа к состоянию.
 * Внутри — целые копейки, чтобы не копить ошибки округления. Покрыты проверками в tests.ts
 * (Настройки → «Запустить проверки»).
 */
import type { AttendanceStatus, LedgerEntry, PriceEntry, RateEntry, Settings } from "./types";

export const toK = (byn: number) => Math.round(byn * 100 + 1e-7);
export const fromK = (k: number) => k / 100;

/** Округление до копеек half up: x — дробное число копеек */
export const roundHalfUp = (x: number) => Math.floor(x + 0.5 + 1e-9);

function pickBy<T extends { from: string }>(list: T[], date: string, fallback: T | undefined): T | undefined {
  const sorted = [...list].sort((a, b) => (a.from < b.from ? -1 : 1));
  let v: T | undefined = fallback ?? sorted[0];
  for (const x of sorted) if (x.from <= date) v = x;
  return v;
}

/** Цена занятия на дату: берётся последняя запись с from <= date */
export const priceOn = (prices: PriceEntry[], date: string): number => pickBy(prices, date, undefined)?.price ?? 0;
export const rateOn = (rates: RateEntry[], date: string): number => pickBy(rates, date, undefined)?.rate ?? 0;

/** Списывает ли отметка деньги (присутствовал — всегда) */
export function isChargeable(status: AttendanceStatus | undefined, s: Pick<Settings, "chargeAbsent" | "chargeSick" | "chargeExcused">): boolean {
  if (status === "present") return true;
  if (status === "absent") return s.chargeAbsent;
  if (status === "sick") return s.chargeSick;
  if (status === "excused") return s.chargeExcused;
  return false;
}

/** Акт преподавателю: количество × ставка; налоги округляются half up до копейки. Суммы — в BYN */
export function actAmounts(count: number, rateByn: number, incomePct = 13, fsznPct = 1) {
  const accrued = toK(rateByn) * count;
  const income = roundHalfUp((accrued * incomePct) / 100);
  const fszn = roundHalfUp((accrued * fsznPct) / 100);
  return {
    gross: fromK(accrued),
    incomeTax: fromK(income),
    fszn: fromK(fszn),
    net: fromK(accrued - income - fszn),
  };
}

export const balanceAt = (entries: LedgerEntry[], date: string) => entries.reduce((s, e) => (e.date <= date ? s + e.amount : s), 0);

/** Строка ведомости за месяц: конец = начало + сдано − израсходовано (всё в копейках) */
export function monthRowK(entries: LedgerEntry[], month: string) {
  const a = `${month}-01`;
  const b = `${month}-31`;
  let start = 0;
  let paid = 0;
  let spent = 0;
  let spentCount = 0;
  for (const e of entries) {
    if (e.date < a) start += e.amount;
    else if (e.date <= b) {
      if (e.type === "charge") {
        spent -= e.amount;
        spentCount += 1;
      } else paid += e.amount;
    }
  }
  return { start, paid, spent, spentCount, end: start + paid - spent };
}

/* ---------- Договоры ---------- */
const LAT2CYR: Record<string, string> = { a: "а", b: "в", c: "с", e: "е", k: "к", m: "м", h: "н", o: "о", p: "р", t: "т", x: "х", y: "у" };
export const normContractNo = (no: string) =>
  String(no || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[a-z]/g, (c) => LAT2CYR[c] ?? c);

/* ---------- ФИО: нормализация и сходство ---------- */
export const normName = (s: string) => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

function lev(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function similarity(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  const r1 = 1 - lev(x, y) / Math.max(x.length, y.length);
  const sx = x.split(" ").sort().join(" ");
  const sy = y.split(" ").sort().join(" ");
  const r2 = 1 - lev(sx, sy) / Math.max(sx.length, sy.length);
  return Math.max(r1, r2);
}

/** % схожести для показа: 100 только при точном совпадении */
export function similarityPct(a: string, b: string): number {
  if (normName(a) === normName(b)) return 100;
  return Math.min(Math.round(similarity(a, b) * 100), 99);
}

/** Разделение суммы: доли в сумме дают ровно total (копейки) */
export function splitEven(totalK: number, n: number): number[] {
  const base = Math.floor(totalK / n);
  const r = Array<number>(n).fill(base);
  r[n - 1] += totalK - base * n;
  return r;
}

/* ---------- Сумма прописью (BYN) ---------- */
const OM = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const OF = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TE = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TN = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HN = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function triple(n: number, fem: boolean) {
  const o = [HN[Math.floor(n / 100)]];
  const r = n % 100;
  if (r >= 10 && r < 20) o.push(TE[r - 10]);
  else {
    o.push(TN[Math.floor(r / 10)]);
    o.push((fem ? OF : OM)[r % 10]);
  }
  return o.filter(Boolean).join(" ");
}
function plural(n: number, f1: string, f2: string, f5: string) {
  const a = n % 100;
  const b = n % 10;
  if (a >= 11 && a <= 19) return f5;
  if (b === 1) return f1;
  if (b >= 2 && b <= 4) return f2;
  return f5;
}
export function intWords(n: number): string {
  if (n === 0) return "ноль";
  const parts: string[] = [];
  const mil = Math.floor(n / 1e6);
  const th = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  if (mil) parts.push(`${triple(mil, false)} ${plural(mil, "миллион", "миллиона", "миллионов")}`);
  if (th) parts.push(`${triple(th, true)} ${plural(th, "тысяча", "тысячи", "тысяч")}`);
  if (rest) parts.push(triple(rest, false));
  return parts.join(" ");
}
/** «Девяносто три белорусских рубля, 04 копейки» */
export function rubWords(byn: number): string {
  const k = Math.abs(toK(byn));
  const r = Math.floor(k / 100);
  const c = k % 100;
  const s = `${intWords(r)} ${plural(r, "белорусский рубль", "белорусских рубля", "белорусских рублей")}, ${String(c).padStart(2, "0")} ${plural(c, "копейка", "копейки", "копеек")}`;
  return s[0].toUpperCase() + s.slice(1);
}
