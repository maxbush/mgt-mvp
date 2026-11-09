import type {
  AcademicYear, Act, Addendum, Adjustment, AttendanceMap, AttendanceStatus, AuditEntry, Branch, Contract, Direction, Enrollment, Group,
  LedgerEntry, Lesson, MembershipChange, Payment, Role, Settings, Signer, Student, Teacher,
} from "./types";
import { DIRECTION_LABELS } from "./types";
import { actAmounts, balanceAt, fromK, isChargeable, monthRowK, normContractNo, priceOn, rateOn, similarityPct, normName, toK } from "./calc";
import { compareRu, fullName, monthKey, monthLabel, round2, shiftMonth } from "./utils";

export interface DataState {
  branches: Branch[];
  academicYears: AcademicYear[];
  teachers: Teacher[];
  groups: Group[];
  students: Student[];
  enrollments: Enrollment[];
  contracts: Contract[];
  lessons: Lesson[];
  attendance: AttendanceMap;
  payments: Payment[];
  adjustments: Adjustment[];
  acts: Act[];
  signers: Signer[];
  audit: AuditEntry[];
  membership: MembershipChange[];
  addendums: Addendum[];
  settings: Settings;
}

export const attKey = (lessonId: string, studentId: string) => `${lessonId}|${studentId}`;

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; short: string; className: string; dot: string; hotkey: string }
> = {
  present: { label: "Присутствовал", short: "П", className: "bg-success/15 text-success border-success/30", dot: "bg-success", hotkey: "1" },
  absent: { label: "Отсутствовал", short: "Н", className: "bg-destructive/12 text-destructive border-destructive/30", dot: "bg-destructive", hotkey: "2" },
  sick: { label: "Болел", short: "Б", className: "bg-warning/20 text-amber-700 dark:text-amber-300 border-warning/40", dot: "bg-warning", hotkey: "3" },
  excused: { label: "Уважительная", short: "У", className: "bg-info/15 text-info border-info/30", dot: "bg-info", hotkey: "4" },
};
export const ATTENDANCE_CYCLE: (AttendanceStatus | null)[] = ["present", "absent", "sick", "excused", null];
/** Символы печатных форм (как в школьном журнале) */
export const PRINT_MARK: Record<AttendanceStatus, string> = { present: "1", absent: "н", sick: "б", excused: "у" };

/* ---------- Базовые ---------- */
export const todayOf = (s: DataState) => s.settings.today;
export const curMonth = (s: DataState) => s.settings.today.slice(0, 7);
export const isMonthClosed = (s: DataState, month: string) => s.settings.closedMonths.includes(month);

export const currentYear = (s: DataState) => s.academicYears.find((y) => y.isCurrent) ?? s.academicYears[s.academicYears.length - 1];
export const studentById = (s: DataState, id: string) => s.students.find((x) => x.id === id);
export const groupById = (s: DataState, id: string) => s.groups.find((x) => x.id === id);
export const teacherById = (s: DataState, id: string) => s.teachers.find((x) => x.id === id);
export const branchById = (s: DataState, id: string) => s.branches.find((x) => x.id === id);
export const yearById = (s: DataState, id: string) => s.academicYears.find((x) => x.id === id);

export const groupPrice = (g: Group, date: string) => priceOn(g.prices, date);
export const currentGroupPrice = (s: DataState, g: Group) => priceOn(g.prices, todayOf(s));
export const currentRate = (s: DataState, month?: string) => rateOn(s.settings.rates, month ? `${month}-31` : todayOf(s));

/* ---------- Зачисления ---------- */
export const isEnrolledOn = (s: DataState, studentId: string, groupId: string, date: string) =>
  s.enrollments.some((e) => e.studentId === studentId && e.groupId === groupId && e.from <= date && (!e.to || e.to >= date));

/** Id учеников группы на дату (по умолчанию — сегодня) */
export const groupStudentIds = (s: DataState, groupId: string, date?: string): string[] => {
  const d = date ?? todayOf(s);
  return [...new Set(s.enrollments.filter((e) => e.groupId === groupId && e.from <= d && (!e.to || e.to >= d)).map((e) => e.studentId))];
};

/** Ученики, числившиеся в группе в течение месяца (неактивные — только если есть отметки в месяце) */
export function groupStudentsInMonth(s: DataState, groupId: string, month: string): Student[] {
  const a = `${month}-01`;
  const b = `${month}-31`;
  const lessons = groupLessons(s, groupId, month);
  const ids = new Set<string>();
  s.enrollments.forEach((e) => {
    if (e.groupId === groupId && e.from <= b && (!e.to || e.to >= a)) ids.add(e.studentId);
  });
  return [...ids]
    .map((id) => studentById(s, id))
    .filter((st): st is Student => !!st)
    .filter((st) => st.status === "active" || lessons.some((l) => s.attendance[attKey(l.id, st.id)]))
    .sort((x, y) => compareRu(fullName(x), fullName(y)));
}

export const studentEnrollments = (s: DataState, studentId: string) =>
  s.enrollments.filter((e) => e.studentId === studentId).sort((a, b) => (a.from < b.from ? 1 : -1));

/** Группы ученика «сейчас»; для выбывших — последние */
export function studentGroups(s: DataState, studentId: string): Group[] {
  const t = todayOf(s);
  const en = studentEnrollments(s, studentId);
  const cur = en.filter((e) => e.from <= t && (!e.to || e.to >= t));
  const list = cur.length ? cur : en.slice(0, 1);
  return list.map((e) => groupById(s, e.groupId)).filter((g): g is Group => !!g);
}

export const studentContracts = (s: DataState, studentId: string) =>
  s.contracts.filter((c) => c.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date));
export const currentContract = (s: DataState, studentId: string) => {
  const y = currentYear(s);
  return s.contracts.find((c) => c.studentId === studentId && c.academicYearId === y.id && c.status === "active")
    ?? s.contracts.find((c) => c.studentId === studentId && c.academicYearId === y.id);
};

export const sortedStudents = (list: Student[]) => [...list].sort((a, b) => compareRu(fullName(a), fullName(b)));

export const effectiveTeacherId = (s: DataState, lesson: Lesson) =>
  lesson.substituteTeacherId ?? groupById(s, lesson.groupId)?.teacherId ?? "";

export const groupLessons = (s: DataState, groupId: string, month?: string) =>
  s.lessons
    .filter((l) => l.groupId === groupId && (!month || l.date.startsWith(month)))
    .sort((a, b) => a.date.localeCompare(b.date));

export const teacherGroups = (s: DataState, teacherId: string) => s.groups.filter((g) => g.teacherId === teacherId);

/** Конфликт номера договора в пределах учебного года → кто занял номер */
export function contractConflict(s: DataState, number: string, academicYearId: string, excludeId?: string) {
  const n = normContractNo(number);
  if (!n) return null;
  const c = s.contracts.find((x) => x.id !== excludeId && x.academicYearId === academicYearId && normContractNo(x.number) === n);
  if (!c) return null;
  const st = studentById(s, c.studentId);
  return { contract: c, student: st, message: `Номер ${number.trim()} уже занят: ${st ? fullName(st) : "другой ученик"}, от ${c.date.slice(8, 10)}.${c.date.slice(5, 7)}.${c.date.slice(0, 4)}` };
}
export const isContractNumberTaken = (s: DataState, number: string, academicYearId: string, excludeId?: string) =>
  !!contractConflict(s, number, academicYearId, excludeId);

/* ---------- Состояние занятий и права на правку ---------- */
let idxKey: unknown[] = [];
let idx: { marked: Set<string>; charges: Map<string, LedgerEntry[]> } = { marked: new Set(), charges: new Map() };
function index(s: DataState) {
  const key = [s.lessons, s.attendance, s.groups, s.settings];
  if (key.every((k, i) => k === idxKey[i])) return idx;
  const lessonById = new Map(s.lessons.map((l) => [l.id, l]));
  const groupMap = new Map(s.groups.map((g) => [g.id, g]));
  const marked = new Set<string>();
  const charges = new Map<string, LedgerEntry[]>();
  for (const [k, st] of Object.entries(s.attendance)) {
    const [lessonId, studentId] = k.split("|");
    const l = lessonById.get(lessonId);
    if (!l) continue;
    marked.add(lessonId);
    if (l.cancelled || !isChargeable(st, s.settings)) continue;
    const g = groupMap.get(l.groupId);
    if (!g) continue;
    const price = priceOn(g.prices, l.date);
    const arr = charges.get(studentId) ?? [];
    arr.push({ date: l.date, type: "charge", amount: -toK(price), label: `Занятие ${g.code}${st === "absent" ? " (неявка)" : st === "excused" ? " (уважительная)" : st === "sick" ? " (болел)" : ""}`, ref: l.id, groupId: g.id });
    charges.set(studentId, arr);
  }
  idxKey = key;
  idx = { marked, charges };
  return idx;
}

export type LessonState = "planned" | "held" | "cancelled";
export const lessonState = (s: DataState, l: Lesson): LessonState => (l.cancelled ? "cancelled" : index(s).marked.has(l.id) ? "held" : "planned");

/** Можно ли пользователю править отметки на занятии */
export function lessonEditCheck(s: DataState, l: Lesson, role: Role, teacherId?: string): { ok: boolean; reason?: string } {
  const m = l.date.slice(0, 7);
  if (isMonthClosed(s, m)) return { ok: false, reason: `Месяц «${monthLabel(m)}» закрыт: журналы, платежи и проводки за него не редактируются. Администратор может открыть месяц в разделе «Ведомости оплат».` };
  if (l.cancelled) return { ok: false, reason: "Занятие не состоялось — отметки не ставятся и ничего не списывают." };
  if (role === "teacher") {
    const eff = effectiveTeacherId(s, l);
    if (eff !== teacherId) {
      const t = teacherById(s, eff);
      return { ok: false, reason: `Это занятие ведёт: ${t ? `${t.lastName} ${t.firstName[0]}.` : "другой преподаватель"}. Править отметки может только преподаватель занятия (основной или замена).` };
    }
    const cur = curMonth(s);
    if (m !== cur && m !== shiftMonth(cur, -1)) return { ok: false, reason: "Преподаватель может править только текущий и предыдущий месяц. Обратитесь к администратору." };
  } else if (role === "accountant") return { ok: false, reason: "У роли «Бухгалтер» журнал доступен только для чтения." };
  return { ok: true };
}

/* ---------- Финансы: проводки ---------- */
export function ledger(s: DataState, studentId: string): LedgerEntry[] {
  const st = studentById(s, studentId);
  const out: LedgerEntry[] = [];
  if (st && st.openingBalance) out.push({ date: s.settings.openingDate, type: "open", amount: toK(st.openingBalance), label: "Начальный остаток (перенос из Excel)" });
  const src = (m: Payment["method"]) => (m === "bepaid" ? "BePaid" : m === "erip" ? "ЕРИП" : m === "card" ? "карта" : "вручную");
  for (const p of s.payments) {
    if (p.status !== "confirmed") continue;
    if (p.splits) {
      p.splits.filter((x) => x.studentId === studentId).forEach((x) =>
        out.push({ date: p.date, type: "pay", amount: toK(x.amount), label: `Платёж (${src(p.method)}), часть общего платежа ${p.amount.toFixed(2).replace(".", ",")} BYN`, ref: p.id }),
      );
    } else if (p.studentId === studentId) {
      out.push({ date: p.date, type: "pay", amount: toK(p.amount), label: `Платёж (${src(p.method)})${p.payer ? `: ${p.payer}` : ""}`, ref: p.id });
    }
  }
  for (const a of s.adjustments) if (a.studentId === studentId) out.push({ date: a.date, type: "adj", amount: toK(a.amount), label: `Корректировка: ${a.comment}`, ref: a.id });
  out.push(...(index(s).charges.get(studentId) ?? []));
  const order = { open: 0, pay: 1, adj: 2, charge: 3 } as const;
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order[a.type] - order[b.type]));
}

export interface BalanceRow {
  month: string;
  label: string;
  opening: number;
  paid: number;
  consumedCount: number;
  consumed: number;
  closing: number;
}

export function balanceRow(s: DataState, studentId: string, month: string): BalanceRow {
  const r = monthRowK(ledger(s, studentId), month);
  return { month, label: monthLabel(month), opening: fromK(r.start), paid: fromK(r.paid), consumedCount: r.spentCount, consumed: fromK(r.spent), closing: fromK(r.end) };
}

export function balanceHistory(s: DataState, studentId: string, upTo?: string): BalanceRow[] {
  const y = currentYear(s);
  const rows: BalanceRow[] = [];
  let m = monthKey(y.startDate);
  const last = upTo ?? curMonth(s);
  while (m <= last) {
    rows.push(balanceRow(s, studentId, m));
    m = shiftMonth(m, 1);
  }
  return rows;
}

export const currentBalance = (s: DataState, studentId: string) => fromK(balanceAt(ledger(s, studentId), todayOf(s)));

/* ---------- Ведомость: листы «филиал» и «IT-класс» ---------- */
export interface Sheet {
  id: string;
  name: string;
  address: string;
  groupIds: string[];
}
export function statementSheets(s: DataState): Sheet[] {
  const out: Sheet[] = s.branches.map((b) => ({ id: `br_${b.id}`, name: b.name, address: b.address, groupIds: s.groups.filter((g) => g.branchId === b.id && g.direction !== "it").map((g) => g.id) }));
  const it = s.groups.filter((g) => g.direction === "it");
  if (it.length) {
    const b = branchById(s, it[0].branchId);
    out.push({ id: "dir_it", name: `IT-класс (${b?.name ?? ""})`, address: b?.address ?? "", groupIds: it.map((g) => g.id) });
  }
  return out;
}

export interface StatementRow extends BalanceRow {
  student: Student;
  groups: Group[];
  /** Расход по группам: {groupId: BYN} */
  byGroup: Record<string, number>;
  /** Расход в нескольких группах / часть относится к другим листам */
  multi: boolean;
  foreign: boolean;
}

export function statementRows(s: DataState, sheetId: string, month: string, opts: { groupId?: string; debtOnly?: boolean } = {}): StatementRow[] {
  const sheet = statementSheets(s).find((x) => x.id === sheetId) ?? statementSheets(s)[0];
  const gids = new Set(sheet.groupIds);
  const a = `${month}-01`;
  const b = `${month}-31`;
  const rows: StatementRow[] = [];
  for (const st of s.students) {
    const en = studentEnrollments(s, st.id);
    const overlap = en.filter((e) => e.from <= b && (!e.to || e.to >= a));
    const led = ledger(s, st.id);
    const charges = led.filter((e) => e.type === "charge" && e.date >= a && e.date <= b);
    const r = monthRowK(led, month);
    let show = overlap.some((e) => gids.has(e.groupId)) || charges.some((c) => c.groupId && gids.has(c.groupId));
    if (!show && !overlap.length && !charges.length) {
      const last = [...en].sort((x, y) => ((x.to ?? "9") < (y.to ?? "9") ? 1 : -1))[0];
      if (last && gids.has(last.groupId) && (r.start || r.end || r.paid)) show = true; // выбывший: остаток виден, пока не нулевой
    }
    if (!show) continue;
    const byGroup: Record<string, number> = {};
    charges.forEach((c) => { if (c.groupId) byGroup[c.groupId] = (byGroup[c.groupId] ?? 0) - fromK(c.amount); });
    let grs = overlap.map((e) => groupById(s, e.groupId)).filter((g): g is Group => !!g && gids.has(g.id));
    if (!grs.length) {
      const last = [...en].sort((x, y) => ((x.to ?? "9") < (y.to ?? "9") ? 1 : -1))[0];
      const g = last && groupById(s, last.groupId);
      if (g) grs = [g];
    }
    grs = [...new Set(grs)];
    if (opts.groupId && !grs.some((g) => g.id === opts.groupId)) continue;
    if (opts.debtOnly && !(r.end < 0)) continue;
    rows.push({
      month, label: monthLabel(month), opening: fromK(r.start), paid: fromK(r.paid), consumedCount: r.spentCount, consumed: fromK(r.spent), closing: fromK(r.end),
      student: st, groups: grs, byGroup,
      multi: Object.keys(byGroup).length > 1 || overlap.some((e) => !gids.has(e.groupId)),
      foreign: Object.keys(byGroup).some((k) => !gids.has(k)),
    });
  }
  return rows.sort((x, y) => compareRu(fullName(x.student), fullName(y.student)));
}

export function statementTotals(rows: BalanceRow[]) {
  const k = (f: (r: BalanceRow) => number) => fromK(rows.reduce((a, r) => a + toK(f(r)), 0));
  return { opening: k((r) => r.opening), consumed: k((r) => r.consumed), paid: k((r) => r.paid), closing: k((r) => r.closing) };
}

/* ---------- Акты ---------- */
export function actCalc(count: number, rate: number, incomePct = 13, fsznPct = 1) {
  return actAmounts(count, rate, incomePct, fsznPct);
}

/** Проведённые занятия (есть отметки, не отменены), где преподаватель — основной или замена */
export const teacherLessonsInMonth = (s: DataState, teacherId: string, month: string) =>
  s.lessons.filter((l) => l.date.startsWith(month) && lessonState(s, l) === "held" && effectiveTeacherId(s, l) === teacherId);

/* ---------- Посещаемость ---------- */
export interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  sick: number;
  excused: number;
  rate: number;
}

export function attendanceStats(
  s: DataState,
  opts: { month?: string; groupId?: string; studentId?: string; groupIds?: string[] } = {},
): AttendanceStats {
  const res: AttendanceStats = { total: 0, present: 0, absent: 0, sick: 0, excused: 0, rate: 0 };
  const lessonSet = new Map<string, Lesson>();
  for (const l of s.lessons) {
    if (l.cancelled) continue;
    if (opts.month && !l.date.startsWith(opts.month)) continue;
    if (opts.groupId && l.groupId !== opts.groupId) continue;
    if (opts.groupIds && !opts.groupIds.includes(l.groupId)) continue;
    lessonSet.set(l.id, l);
  }
  for (const [key, st] of Object.entries(s.attendance)) {
    const [lessonId, studentId] = key.split("|");
    if (!lessonSet.has(lessonId)) continue;
    if (opts.studentId && studentId !== opts.studentId) continue;
    res.total += 1;
    res[st] += 1;
  }
  res.rate = res.total ? Math.round((res.present / res.total) * 1000) / 10 : 0;
  return res;
}

export function monthsOfYear(s: DataState, upTo?: string) {
  const y = currentYear(s);
  const out: string[] = [];
  let m = monthKey(y.startDate);
  const last = upTo ?? curMonth(s);
  while (m <= last) {
    out.push(m);
    m = shiftMonth(m, 1);
  }
  return out;
}

export function attendanceSeries(s: DataState, groupIds?: string[]) {
  return monthsOfYear(s).map((m) => {
    const st = attendanceStats(s, { month: m, groupIds });
    return { month: m, label: monthLabel(m).slice(0, 3), rate: st.rate, present: st.present, total: st.total };
  });
}

export const confirmedPaymentSum = (s: DataState, from: string, toExclusive: string) =>
  round2(s.payments.filter((p) => p.status === "confirmed" && p.date >= from && p.date < toExclusive).reduce((a, p) => a + p.amount, 0));

export function financeSeries(s: DataState) {
  const { charges } = index(s);
  return monthsOfYear(s).map((m) => {
    const paid = confirmedPaymentSum(s, `${m}-01`, `${shiftMonth(m, 1)}-01`);
    let consumed = 0;
    charges.forEach((arr) => arr.forEach((e) => { if (e.date.startsWith(m)) consumed -= e.amount; }));
    return { month: m, label: monthLabel(m).slice(0, 3), paid, consumed: fromK(consumed) };
  });
}

/* ---------- Платежи: сопоставление ---------- */
export const exactStudentMatches = (s: DataState, payer: string) => s.students.filter((st) => normName(fullName(st)) === normName(payer));
export function paymentCandidates(s: DataState, payer: string, n = 3) {
  return s.students
    .map((st) => ({ student: st, pct: similarityPct(payer, fullName(st)) }))
    .sort((a, b) => b.pct - a.pct || compareRu(fullName(a.student), fullName(b.student)))
    .slice(0, n);
}
export const pendingPayments = (s: DataState) => s.payments.filter((p) => p.status === "pending");

/* ---------- Dashboard ---------- */
export function dashboardKpis(s: DataState, scopeGroupIds?: string[]) {
  const m = curMonth(s);
  const groups = scopeGroupIds ? s.groups.filter((g) => scopeGroupIds.includes(g.id)) : s.groups;
  const studentIds = new Set<string>();
  groups.forEach((g) => groupStudentIds(s, g.id).forEach((id) => studentIds.add(id)));
  const students = scopeGroupIds ? s.students.filter((x) => studentIds.has(x.id)) : s.students;
  const active = students.filter((x) => x.status === "active");
  const att = attendanceStats(s, { month: m, groupIds: scopeGroupIds });
  const attPrev = attendanceStats(s, { month: shiftMonth(m, -1), groupIds: scopeGroupIds });
  const balances = active.map((x) => currentBalance(s, x.id));
  const totalBalance = round2(balances.reduce((a, b) => a + b, 0));
  const debtors = balances.filter((b) => b < 0).length;
  const paidThisMonth = confirmedPaymentSum(s, `${m}-01`, `${shiftMonth(m, 1)}-01`);
  const paidPrev = confirmedPaymentSum(s, `${shiftMonth(m, -1)}-01`, `${m}-01`);
  return {
    activeStudents: active.length,
    totalStudents: students.length,
    newThisMonth: students.filter((x) => x.createdAt.startsWith(m)).length,
    groups: groups.filter((g) => g.status === "active").length,
    attendanceRate: att.rate,
    attendanceDelta: round2(att.rate - attPrev.rate),
    totalBalance,
    debtors,
    paidThisMonth,
    paidDelta: paidPrev ? Math.round(((paidThisMonth - paidPrev) / paidPrev) * 100) : 0,
    teachers: s.teachers.filter((t) => t.status === "active").length,
    lessonsThisMonth: s.lessons.filter((l) => l.date.startsWith(m) && !l.cancelled && (!scopeGroupIds || scopeGroupIds.includes(l.groupId))).length,
    pending: pendingPayments(s).length,
  };
}

export function upcomingLessons(s: DataState, fromDate: string, groupIds?: string[], limit = 6) {
  return s.lessons
    .filter((l) => l.date >= fromDate && !l.cancelled && (!groupIds || groupIds.includes(l.groupId)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

export function recentLessons(s: DataState, upTo: string, groupIds?: string[], limit = 6) {
  return s.lessons
    .filter((l) => l.date <= upTo && (!groupIds || groupIds.includes(l.groupId)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export const lessonMarkedCount = (s: DataState, lesson: Lesson) => {
  const ids = groupStudentIds(s, lesson.groupId, lesson.date);
  let marked = 0;
  let present = 0;
  for (const sid of ids) {
    const st = s.attendance[attKey(lesson.id, sid)];
    if (st) marked += 1;
    if (st === "present") present += 1;
  }
  return { marked, present, total: ids.length };
};

/** Занятия в прошлом без единой отметки (требуют внимания) */
export const pastUnmarkedLessons = (s: DataState) =>
  s.lessons.filter((l) => l.date < todayOf(s) && lessonState(s, l) === "planned").sort((a, b) => a.date.localeCompare(b.date));

export const directionLabel = (d: Direction) => DIRECTION_LABELS[d];
