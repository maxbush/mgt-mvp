/** API-клиент backend'а CRM (Django+DRF, /api/v1).
 *
 * Включается при `?api` в URL или `VITE_API_URL`. Работает на session-cookie:
 * сначала GET /auth/csrf, потом все запросы с credentials + X-CSRFToken.
 * Мапперы приводят snake_case API к типам фронта (camelCase, эталон — types.ts).
 */
import type {
  AcademicYear, Act, Addendum, AddendumTemplate, Adjustment, AttendanceMap, Branch, Contract, Enrollment,
  Group, Lesson, MembershipChange, Payment, Settings, Signer, Student, Teacher, AuditEntry,
} from "./types";
import type { DataState } from "./selectors";

export const API_BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000/api/v1";

let csrf = "";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function req<T>(method: string, path: string, body?: unknown, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-CSRFToken": csrf } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...opts,
  });
  if (r.status === 204) return undefined as T;
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const e = data?.error;
    throw new ApiError(r.status, e?.code ?? "error", e?.message ?? `HTTP ${r.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b?: unknown) => req<T>("POST", p, b),
  put: <T>(p: string, b?: unknown) => req<T>("PUT", p, b),
  patch: <T>(p: string, b?: unknown) => req<T>("PATCH", p, b),
  del: (p: string) => req<void>("DELETE", p),
};

export async function csrfInit() {
  const d = await api.get<{ csrfToken: string }>("/auth/csrf");
  csrf = d.csrfToken;
}

/* ---------- пагинация ---------- */
type Page<T> = { count: number; results: T[] };
const list = async <T>(path: string): Promise<T[]> => {
  const d = await api.get<Page<T> | T[]>(path + (path.includes("?") ? "&" : "?") + "page_size=500");
  return Array.isArray(d) ? d : d.results;
};

/* ---------- мапперы API → фронт ---------- */
const num = (x: unknown) => Number(x ?? 0);
const b2f = {
  branch: (b: any): Branch => ({ id: b.id, name: b.name, shortName: b.short_name || b.name, address: b.address, color: b.color || "#6366f1" }),
  year: (y: any): AcademicYear => ({ id: y.id, label: y.name, startDate: y.start_date, endDate: y.end_date, isCurrent: y.is_current }),
  signer: (s: any): Signer => ({ id: s.id, name: s.name, position: s.position, positionGen: s.position_gen, female: s.female, isDefault: s.is_default }),
  teacher: (t: any): Teacher => ({
    id: t.id, lastName: t.last_name, firstName: t.first_name, middleName: t.middle_name ?? "",
    phone: t.phone ?? "", email: t.email ?? "", status: t.status,
    contractNumber: t.contract_number ?? "", contractDate: t.contract_date ?? "",
    passport: { series: t.passport_series ?? "", number: t.passport_number ?? "", issuedBy: t.passport_issued ?? "", issuedAt: t.passport_date ?? "", personalNumber: t.personal_number ?? "" },
    bank: { iban: t.iban ?? "", bankName: t.bank_name ?? "", bic: t.bank_bic ?? "" },
    address: t.address_reg ?? "", rate: num(t.rate), subjects: t.subjects ?? [],
  }),
  group: (g: any): Group => ({
    id: g.id, code: g.code, name: g.name, direction: g.direction, branchId: g.branch,
    teacherId: g.teacher ?? "", academicYearId: g.academic_year ?? "",
    prices: (g.prices ?? []).map((p: any) => ({ from: p.date_from, price: num(p.price) })),
    schedule: g.schedule ?? "", weekdays: g.weekdays ?? [], status: g.status, createdAt: g.created_at ?? "2026-09-01",
  }),
  student: (s: any): Student => ({
    id: s.id, lastName: s.last_name, firstName: s.first_name, middleName: s.middle_name ?? "",
    birthYear: s.birth_year ?? 0, grade: s.grade ?? "", branchId: s.branch ?? "",
    status: s.status, parentName: s.parent_name ?? "", parentPhone: s.parent_phone ?? "",
    parentPhone2: s.parent_phone2 || undefined, notes: s.comment || undefined,
    createdAt: s.created_at ?? "", openingBalance: num(s.opening_balance),
  }),
  contract: (c: any): Contract => ({
    id: c.id, studentId: c.student, number: c.number, academicYearId: c.academic_year,
    date: c.date, status: c.status, closedAt: c.closed_at ?? undefined,
  }),
  enrollment: (e: any): Enrollment => ({ id: String(e.id), studentId: e.student, groupId: e.group, from: e.date_from, to: e.date_to ?? null }),
  lesson: (l: any): Lesson => ({
    id: l.id, groupId: l.group, date: l.date, substituteTeacherId: l.substitute_teacher ?? null,
    cancelled: l.cancelled ?? false, topic: l.topic ?? "",
  }),
  payment: (p: any): Payment => ({
    id: p.id, studentId: p.student ?? null, date: p.date, amount: num(p.amount),
    method: p.method === "manual" ? "cash" : p.method, status: p.status,
    payer: p.payer || undefined, extId: p.ext_id || undefined,
    splits: (p.splits ?? []).map((x: any) => ({ studentId: x.student, amount: num(x.amount) })),
    note: p.note || undefined, comment: p.comment || undefined, createdBy: "CRM",
  }),
  adjustment: (a: any): Adjustment => ({
    id: a.id, studentId: a.student, date: a.date, amount: num(a.amount), comment: a.comment, createdBy: "CRM",
  }),
  act: (a: any): Act => ({
    id: a.id, number: a.number, teacherId: a.teacher, month: a.month, lessonsCount: a.lessons_count,
    rate: num(a.rate), gross: num(a.gross), incomeTax: num(a.income_tax), fszn: num(a.fszn), net: num(a.net),
    signerId: a.signer ?? "", status: a.status, source: a.source, createdAt: a.created_at ?? "",
  }),
  audit: (a: any): AuditEntry => ({
    id: String(a.id), at: a.at, userId: a.user ?? "", userName: a.user_name ?? "система",
    action: a.action, entity: a.entity, entityId: a.entity_id ?? "",
    description: a.meta?.description ?? `${a.action} ${a.entity}`,
  }),
  addendum: (a: any): Addendum => ({
    id: a.id, contractId: a.contract, studentId: "", number: a.number, date: a.date,
    templateId: a.template ?? "", clause: a.clause ?? "", text: a.body ?? "", signerId: a.signer ?? "", createdAt: a.created_at ?? "",
  }),
  template: (t: any): AddendumTemplate => ({ id: t.id, title: t.name, clause: t.clause ?? "", text: t.body }),
};

/* ---------- гидрация DataState ---------- */
export interface MePayload {
  user: { id: string; username: string; first_name: string; last_name: string; email: string; role: string; teacher: string | null };
  role: string;
  permissions: string[];
  teacher_id: string | null;
  server_date: string;
  closed_months: string[];
}

export const me = () => api.get<MePayload>("/auth/me");

export async function hydrate(meData: MePayload): Promise<DataState> {
  const [branches, years, signers, teachers, groups, students, contracts, enrollments, lessons, marks,
    payments, adjustments, acts, audit, _templates, addendums, policies, taxRates, actRates, sysSet] = await Promise.all([
    list<any>("/branches/"), list<any>("/academic-years/"), list<any>("/signers/"), list<any>("/teachers/"),
    list<any>("/groups/"), list<any>("/students/"), list<any>("/contracts/"), list<any>("/enrollments/"),
    list<any>("/lessons/"), api.get<AttendanceMap>("/marks"),
    list<any>("/payments/"), list<any>("/adjustments/"), list<any>("/acts/"), list<any>("/audit/").catch(() => [] as any[]),
    list<any>("/addendum-templates/"), list<any>("/addendums/"), list<any>("/charge-policies/"),
    list<any>("/tax-rates/"), list<any>("/act-rates/"), api.get<Record<string, unknown>>("/settings/"),
  ]);
  const pol = policies.sort((a, b) => b.date_from.localeCompare(a.date_from))[0];
  const inc = taxRates.filter((t) => t.kind === "income_tax").sort((a, b) => b.date_from.localeCompare(a.date_from))[0];
  const fsz = taxRates.filter((t) => t.kind === "fszn").sort((a, b) => b.date_from.localeCompare(a.date_from))[0];
  // membership синтезируется из зачислений (enroll→added, unenroll→removed)
  const membership: MembershipChange[] = enrollments.flatMap((e) => {
    const out: MembershipChange[] = [{ id: `me_${e.id}`, groupId: e.group, studentId: e.student, type: "added", at: `${e.date_from}T10:00:00`, by: "CRM" }];
    if (e.date_to) out.push({ id: `mr_${e.id}`, groupId: e.group, studentId: e.student, type: "removed", at: `${e.date_to}T18:00:00`, by: "CRM" });
    return out;
  });
  const settings: Settings = {
    today: meData.server_date,
    chargeAbsent: pol?.charge_absent ?? true,
    chargeSick: pol?.charge_sick ?? false,
    chargeExcused: pol?.charge_excused ?? false,
    incomePct: num(inc?.pct ?? 13),
    fsznPct: num(fsz?.pct ?? 1),
    rates: actRates.map((r) => ({ from: r.date_from, rate: num(r.rate) })),
    closedMonths: meData.closed_months,
    openingDate: (sysSet.opening_date as string) ?? "2026-08-31",
  };
  return {
    branches: branches.map(b2f.branch), academicYears: years.map(b2f.year), teachers: teachers.map(b2f.teacher),
    groups: groups.map(b2f.group), students: students.map(b2f.student), enrollments: enrollments.map(b2f.enrollment),
    contracts: contracts.map(b2f.contract), lessons: lessons.map(b2f.lesson), attendance: marks,
    payments: payments.map(b2f.payment), adjustments: adjustments.map(b2f.adjustment), acts: acts.map(b2f.act),
    signers: signers.map(b2f.signer), audit: audit.map(b2f.audit), membership, addendums: addendums.map(b2f.addendum), settings,
  };
}
