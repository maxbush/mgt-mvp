import { useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AcademicYear, Act, Addendum, AttendanceStatus, AuditAction, Branch, Contract, EntityStatus, Group, Payment, PaymentMethod,
  RecentItem, Role, Settings, Signer, Student, Teacher,
} from "./types";
import {
  ACADEMIC_YEARS, ACTS, ADJUSTMENTS, ATTENDANCE, AUDIT, BRANCHES, CONTRACTS, DEFAULT_SETTINGS, ENROLLMENTS, GROUPS, LESSONS, MEMBERSHIP, PAYMENTS,
  SIGNERS, STUDENTS, TEACHERS, USERS,
} from "./mock-data";
import type { DataState } from "./selectors";
import {
  actCalc, attKey, currentRate, effectiveTeacherId, exactStudentMatches, groupById, isMonthClosed, studentById, teacherById, teacherLessonsInMonth,
} from "./selectors";
import { toK } from "./calc";
import { parseStatement } from "./bepaid";
import { formatDate, formatMoney, fullName, monthGenitive, monthLabel, shortName, uid } from "./utils";

export type Theme = "light" | "dark" | "system";
export type Result = { ok: true } | { ok: false; reason: string };
export interface ImportResult {
  loaded: number;
  auto: number;
  queued: number;
  dups: number;
  closed: number;
  bad: number[];
}

interface PrefsState {
  theme: Theme;
  role: Role;
  /** Какой преподаватель «вошёл», когда role = teacher */
  teacherId: string;
  onboardingDone: boolean;
  recent: RecentItem[];
  sidebarCollapsed: boolean;
}

interface Actions {
  setTheme: (t: Theme) => void;
  setRole: (r: Role, teacherId?: string) => void;
  setOnboardingDone: () => void;
  pushRecent: (item: RecentItem) => void;
  toggleSidebar: () => void;
  resetDemo: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  toggleMonthClosed: (month: string) => void;

  log: (action: AuditAction, entity: string, entityId: string, description: string) => void;

  upsertStudent: (student: Student, contract?: { id?: string; number: string; academicYearId: string; date: string }) => void;
  setStudentsStatus: (ids: string[], status: EntityStatus) => void;
  deleteStudent: (id: string) => void;
  closeContract: (contractId: string, status: "closed" | "terminated") => void;

  upsertGroup: (group: Group) => void;
  addStudentsToGroup: (groupId: string, studentIds: string[], from?: string) => void;
  removeStudentFromGroup: (groupId: string, studentId: string, lastDay?: string) => void;
  transferStudent: (studentId: string, fromGroupId: string, toGroupId: string, date: string) => Result;

  addLesson: (groupId: string, date: string) => string | null;
  generateMonthLessons: (groupId: string, month: string) => number;
  removeLesson: (lessonId: string) => void;
  setSubstitute: (lessonId: string, teacherId: string | null) => void;
  setCancelled: (lessonId: string, cancelled: boolean) => void;
  setAttendance: (lessonId: string, studentId: string, status: AttendanceStatus | null) => void;
  setAttendanceBulk: (lessonId: string, studentIds: string[], status: AttendanceStatus | null) => void;

  addPayment: (p: { studentId: string | null; date: string; amount: number; method: PaymentMethod; comment?: string; payer?: string }) => Result;
  deletePayment: (id: string) => Result;
  importStatement: (csv: string) => ImportResult;
  confirmPayment: (id: string, studentId: string) => Result;
  splitPayment: (id: string, parts: { studentId: string; amount: number }[]) => Result;
  rejectPayment: (id: string, note?: string) => Result;
  requeuePayment: (id: string) => Result;
  addAdjustment: (a: { studentId: string; date: string; amount: number; comment: string }) => Result;
  removeAdjustment: (id: string) => Result;

  upsertTeacher: (t: Teacher) => void;
  setTeacherStatus: (id: string, status: EntityStatus) => void;

  generateActs: (month: string, rate: number, signerId: string) => number;
  updateAct: (id: string, patch: Partial<Act>) => void;
  deleteAct: (id: string) => void;

  upsertSigner: (s: Signer) => void;
  removeSigner: (id: string) => void;
  upsertBranch: (b: Branch) => void;
  addAcademicYear: (y: AcademicYear) => void;
  setCurrentYear: (id: string) => void;

  addAddendum: (a: Omit<Addendum, "id" | "createdAt">) => void;
}

export type AppState = DataState & PrefsState & Actions;

const freshData = (): DataState => ({
  branches: BRANCHES,
  academicYears: ACADEMIC_YEARS,
  teachers: TEACHERS,
  groups: GROUPS,
  students: STUDENTS,
  enrollments: ENROLLMENTS,
  contracts: CONTRACTS,
  lessons: LESSONS,
  attendance: ATTENDANCE,
  payments: PAYMENTS,
  adjustments: ADJUSTMENTS,
  acts: ACTS,
  signers: SIGNERS,
  audit: AUDIT,
  membership: MEMBERSHIP,
  addendums: [],
  settings: DEFAULT_SETTINGS,
});

const closedReason = (s: DataState, date: string): string | null => {
  const m = date.slice(0, 7);
  return isMonthClosed(s, m)
    ? `Месяц «${monthLabel(m)}» закрыт: журналы, платежи и проводки за него не редактируются. Администратор может открыть месяц в разделе «Ведомости оплат».`
    : null;
};
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };
const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const currentUser = () => {
        const { role, teacherId } = get();
        if (role === "teacher") {
          const t = teacherById(get(), teacherId);
          if (t) return { id: `u_${t.id}`, name: fullName(t), email: t.email, role, teacherId: t.id };
        }
        return USERS.find((u) => u.role === role) ?? USERS[0];
      };
      const who = () => shortName(splitName(currentUser().name));
      const log: Actions["log"] = (action, entity, entityId, description) => {
        const u = currentUser();
        set((s) => ({
          audit: [{ id: uid("a"), at: new Date().toISOString(), userId: u.id, userName: shortName(splitName(u.name)), action, entity, entityId, description }, ...s.audit],
        }));
      };

      return {
        ...freshData(),
        theme: "system",
        role: "admin",
        teacherId: "t1",
        onboardingDone: false,
        recent: [],
        sidebarCollapsed: false,

        setTheme: (theme) => set({ theme }),
        setRole: (role, teacherId) => set((s) => ({ role, teacherId: teacherId ?? s.teacherId })),
        setOnboardingDone: () => set({ onboardingDone: true }),
        pushRecent: (item) => set((s) => ({ recent: [item, ...s.recent.filter((r) => !(r.type === item.type && r.id === item.id))].slice(0, 8) })),
        toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        resetDemo: () => set({ ...freshData(), recent: [] }),
        setSettings: (patch) => {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
          log("settings", "settings", Object.keys(patch).join(","), `Настройки: ${Object.entries(patch).map(([k, v]) => `${k} → ${String(v)}`).join(", ")}`);
        },
        toggleMonthClosed: (month) => {
          const closed = isMonthClosed(get(), month);
          set((s) => ({ settings: { ...s.settings, closedMonths: closed ? s.settings.closedMonths.filter((m) => m !== month) : [...s.settings.closedMonths, month] } }));
          log("settings", "settings", "closedMonths", `Месяц «${monthLabel(month)}» ${closed ? "открыт" : "закрыт"}`);
        },
        log,

        upsertStudent: (student, contract) => {
          const exists = get().students.some((s) => s.id === student.id);
          set((s) => ({ students: exists ? s.students.map((x) => (x.id === student.id ? student : x)) : [...s.students, student] }));
          if (contract) {
            const existing = contract.id ? get().contracts.find((c) => c.id === contract.id) : undefined;
            const c: Contract = existing
              ? { ...existing, number: contract.number, academicYearId: contract.academicYearId, date: contract.date }
              : { id: uid("c"), studentId: student.id, number: contract.number, academicYearId: contract.academicYearId, date: contract.date, status: "active" };
            set((s) => ({ contracts: existing ? s.contracts.map((x) => (x.id === c.id ? c : x)) : [...s.contracts, c] }));
            if (!existing) log(exists ? "update" : "create", "contract", c.id, `Договор ${c.number} — ${fullName(student)}`);
          }
          log(exists ? "update" : "create", "student", student.id, `${exists ? "Обновлён" : "Создан"} ученик ${fullName(student)}`);
        },

        setStudentsStatus: (ids, status) => {
          const today = get().settings.today;
          set((s) => ({
            students: s.students.map((x) => (ids.includes(x.id) ? { ...x, status } : x)),
            // архив: открытые зачисления закрываются сегодняшней датой — ученик уходит из журналов, история остаётся
            enrollments: status === "inactive" ? s.enrollments.map((e) => (ids.includes(e.studentId) && !e.to ? { ...e, to: e.from <= today ? today : e.from } : e)) : s.enrollments,
          }));
          const names = get().students.filter((x) => ids.includes(x.id)).map(shortName).join(", ");
          log("status", "student", ids.join(","), `Статус → ${status === "active" ? "Активный" : "Неактивный"}: ${names}`);
        },

        deleteStudent: (id) => {
          const st = get().students.find((x) => x.id === id);
          set((s) => ({ students: s.students.filter((x) => x.id !== id), enrollments: s.enrollments.filter((e) => e.studentId !== id) }));
          if (st) log("delete", "student", id, `Удалён ученик ${fullName(st)}`);
        },

        closeContract: (contractId, status) => {
          const today = get().settings.today;
          set((s) => ({ contracts: s.contracts.map((c) => (c.id === contractId ? { ...c, status, closedAt: today } : c)) }));
          const c = get().contracts.find((x) => x.id === contractId);
          if (c) log("update", "contract", c.id, `Договор ${c.number} ${status === "closed" ? "закрыт" : "расторгнут"}`);
        },

        upsertGroup: (group) => {
          const exists = get().groups.some((g) => g.id === group.id);
          set((s) => ({ groups: exists ? s.groups.map((g) => (g.id === group.id ? group : g)) : [...s.groups, group] }));
          log(exists ? "update" : "create", "group", group.id, `${exists ? "Обновлена" : "Создана"} группа «${group.name}»`);
        },

        addStudentsToGroup: (groupId, studentIds, from) => {
          const today = from ?? get().settings.today;
          const now = new Date().toISOString();
          const active = new Set(get().enrollments.filter((e) => e.groupId === groupId && !e.to).map((e) => e.studentId));
          const ids = studentIds.filter((id) => !active.has(id));
          set((s) => ({
            enrollments: [...s.enrollments, ...ids.map((sid) => ({ id: uid("e"), studentId: sid, groupId, from: today, to: null }))],
            membership: [...s.membership, ...ids.map((sid) => ({ id: uid("m"), groupId, studentId: sid, type: "added" as const, at: now, by: who() }))],
          }));
          log("membership", "group", groupId, `Состав группы «${groupById(get(), groupId)?.name}»: +${ids.length}`);
        },

        removeStudentFromGroup: (groupId, studentId, lastDay) => {
          const day = lastDay ?? get().settings.today;
          set((s) => ({
            enrollments: s.enrollments.map((e) => (e.groupId === groupId && e.studentId === studentId && !e.to ? { ...e, to: day < e.from ? e.from : day } : e)),
            membership: [...s.membership, { id: uid("m"), groupId, studentId, type: "removed", at: new Date().toISOString(), by: who() }],
          }));
          const st = studentById(get(), studentId);
          log("membership", "group", groupId, `Из группы «${groupById(get(), groupId)?.name}» исключён ${st ? shortName(st) : studentId}`);
        },

        transferStudent: (studentId, fromGroupId, toGroupId, date) => {
          const en = get().enrollments.find((e) => e.studentId === studentId && e.groupId === fromGroupId && !e.to);
          if (!en) return fail("Ученик не числится в исходной группе.");
          if (fromGroupId === toGroupId) return fail("Выберите другую группу.");
          const last = dayBefore(date);
          if (last < en.from) return fail(`Дата перевода должна быть позже даты зачисления (${formatDate(en.from)}).`);
          const now = new Date().toISOString();
          set((s) => ({
            enrollments: [...s.enrollments.map((e) => (e.id === en.id ? { ...e, to: last } : e)), { id: uid("e"), studentId, groupId: toGroupId, from: date, to: null }],
            membership: [
              ...s.membership,
              { id: uid("m"), groupId: fromGroupId, studentId, type: "removed", at: now, by: who() },
              { id: uid("m"), groupId: toGroupId, studentId, type: "added", at: now, by: who() },
            ],
          }));
          const st = studentById(get(), studentId);
          log("membership", "student", studentId, `Перевод: ${st ? shortName(st) : ""} — из ${groupById(get(), fromGroupId)?.code} в ${groupById(get(), toGroupId)?.code} с ${formatDate(date)}`);
          return OK;
        },

        addLesson: (groupId, date) => {
          if (closedReason(get(), date)) return null;
          if (get().lessons.some((l) => l.groupId === groupId && l.date === date)) return null;
          const id = uid("l");
          set((s) => ({ lessons: [...s.lessons, { id, groupId, date, substituteTeacherId: null }] }));
          log("create", "lesson", id, `Добавлено занятие ${formatDate(date)} — ${groupById(get(), groupId)?.name}`);
          return id;
        },

        generateMonthLessons: (groupId, month) => {
          const g = groupById(get(), groupId);
          if (!g || isMonthClosed(get(), month)) return 0;
          const [y, m] = month.split("-").map(Number);
          const days = new Date(y, m, 0).getDate();
          const created: { id: string; groupId: string; date: string; substituteTeacherId: null }[] = [];
          for (let d = 1; d <= days; d++) {
            const iso = `${month}-${String(d).padStart(2, "0")}`;
            const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
            if (!g.weekdays.includes(wd)) continue;
            if (get().lessons.some((l) => l.groupId === groupId && l.date === iso)) continue;
            created.push({ id: uid("l"), groupId, date: iso, substituteTeacherId: null });
          }
          if (created.length) {
            set((s) => ({ lessons: [...s.lessons, ...created] }));
            log("create", "lesson", groupId, `Добавлено занятий по расписанию: ${created.length} — ${g.name}, ${monthLabel(month)}`);
          }
          return created.length;
        },

        removeLesson: (lessonId) => {
          const l = get().lessons.find((x) => x.id === lessonId);
          if (!l || closedReason(get(), l.date)) return;
          set((s) => {
            const attendance = { ...s.attendance };
            Object.keys(attendance).forEach((k) => k.startsWith(`${lessonId}|`) && delete attendance[k]);
            return { lessons: s.lessons.filter((x) => x.id !== lessonId), attendance };
          });
          log("delete", "lesson", lessonId, `Удалено занятие ${formatDate(l.date)}`);
        },

        setSubstitute: (lessonId, teacherId) => {
          const l0 = get().lessons.find((x) => x.id === lessonId);
          if (!l0 || closedReason(get(), l0.date)) return;
          set((s) => ({ lessons: s.lessons.map((l) => (l.id === lessonId ? { ...l, substituteTeacherId: teacherId } : l)) }));
          const t = teacherId ? teacherById(get(), teacherId) : null;
          log("update", "lesson", lessonId, t ? `Замена на занятии ${formatDate(l0.date)} — ${shortName(t)}` : `Замена на занятии ${formatDate(l0.date)} снята`);
        },

        setCancelled: (lessonId, cancelled) => {
          const l0 = get().lessons.find((x) => x.id === lessonId);
          if (!l0 || closedReason(get(), l0.date)) return;
          set((s) => ({ lessons: s.lessons.map((l) => (l.id === lessonId ? { ...l, cancelled } : l)) }));
          log("update", "lesson", lessonId, `Занятие ${formatDate(l0.date)} ${cancelled ? "не состоялось (списаний нет)" : "возвращено в расписание"}`);
        },

        setAttendance: (lessonId, studentId, status) => {
          const l = get().lessons.find((x) => x.id === lessonId);
          if (!l || closedReason(get(), l.date)) return;
          set((s) => {
            const attendance = { ...s.attendance };
            const k = attKey(lessonId, studentId);
            if (status) attendance[k] = status;
            else delete attendance[k];
            return { attendance };
          });
        },

        setAttendanceBulk: (lessonId, studentIds, status) => {
          const l = get().lessons.find((x) => x.id === lessonId);
          if (!l || closedReason(get(), l.date)) return;
          set((s) => {
            const attendance = { ...s.attendance };
            for (const sid of studentIds) {
              const k = attKey(lessonId, sid);
              if (status) attendance[k] = status;
              else delete attendance[k];
            }
            return { attendance };
          });
          log("attendance", "journal", l.groupId, `Массовая отметка ${formatDate(l.date)}: ${studentIds.length} уч.`);
        },

        addPayment: (p) => {
          const reason = closedReason(get(), p.date);
          if (reason) return fail(reason);
          if (!(p.amount > 0)) return fail("Сумма платежа должна быть больше нуля.");
          const payment: Payment = {
            id: uid("p"), studentId: p.studentId, date: p.date, amount: p.amount, method: p.method, status: p.studentId ? "confirmed" : "pending",
            payer: p.payer, comment: p.comment, createdBy: who(),
          };
          set((s) => ({ payments: [...s.payments, payment] }));
          const st = p.studentId ? studentById(get(), p.studentId) : null;
          log("payment", "student", p.studentId ?? "", `Внесена оплата ${formatMoney(p.amount)}${st ? ` — ${shortName(st)}` : " (на сопоставлении)"}`);
          return OK;
        },

        deletePayment: (id) => {
          const p = get().payments.find((x) => x.id === id);
          if (!p) return OK;
          const reason = closedReason(get(), p.date);
          if (reason) return fail(reason);
          set((s) => ({ payments: s.payments.filter((x) => x.id !== id) }));
          log("delete", "payment", id, `Удалена оплата ${formatMoney(p.amount)} от ${formatDate(p.date)}`);
          return OK;
        },

        importStatement: (csv) => {
          const res: ImportResult = { loaded: 0, auto: 0, queued: 0, dups: 0, closed: 0, bad: [] };
          const { lines, bad } = parseStatement(csv);
          res.bad = bad;
          const seen = new Set(get().payments.map((p) => p.extId).filter(Boolean) as string[]);
          const added: Payment[] = [];
          for (const ln of lines) {
            if (ln.extId && seen.has(ln.extId)) { res.dups += 1; continue; }
            if (closedReason(get(), ln.date)) { res.closed += 1; continue; }
            if (ln.extId) seen.add(ln.extId);
            const m = exactStudentMatches(get(), ln.payer);
            const p: Payment = {
              id: uid("p"), studentId: null, date: ln.date, amount: ln.amount, method: "bepaid", status: "pending", payer: ln.payer, extId: ln.extId || undefined, createdBy: "BePaid",
            };
            if (m.length === 1) { p.studentId = m[0].id; p.status = "confirmed"; res.auto += 1; } else res.queued += 1;
            added.push(p);
            res.loaded += 1;
          }
          if (added.length) set((s) => ({ payments: [...s.payments, ...added] }));
          log("payment", "payments", "import", `Загружена выписка BePaid: ${res.loaded} (авто ${res.auto}, в очередь ${res.queued}, дублей ${res.dups})`);
          return res;
        },

        confirmPayment: (id, studentId) => {
          const p = get().payments.find((x) => x.id === id);
          if (!p) return fail("Платёж не найден.");
          const reason = closedReason(get(), p.date);
          if (reason) return fail(reason);
          set((s) => ({ payments: s.payments.map((x) => (x.id === id ? { ...x, studentId, status: "confirmed", splits: undefined } : x)) }));
          const st = studentById(get(), studentId);
          log("payment", "student", studentId, `Платёж ${formatMoney(p.amount)} сопоставлен — ${st ? shortName(st) : ""}`);
          return OK;
        },

        splitPayment: (id, parts) => {
          const p = get().payments.find((x) => x.id === id);
          if (!p) return fail("Платёж не найден.");
          const reason = closedReason(get(), p.date);
          if (reason) return fail(reason);
          const clean = parts.filter((x) => x.studentId);
          if (clean.length < 2) return fail("Выберите минимум двух учеников.");
          if (new Set(clean.map((x) => x.studentId)).size !== clean.length) return fail("Один и тот же ученик выбран дважды.");
          if (clean.some((x) => !(x.amount > 0))) return fail("Суммы долей должны быть больше нуля.");
          const sum = clean.reduce((a, x) => a + toK(x.amount), 0);
          if (sum !== toK(p.amount)) return fail(`Сумма долей ${formatMoney(sum / 100)} не равна сумме платежа ${formatMoney(p.amount)}.`);
          set((s) => ({ payments: s.payments.map((x) => (x.id === id ? { ...x, studentId: null, status: "confirmed", splits: clean } : x)) }));
          log("payment", "payments", id, `Платёж ${formatMoney(p.amount)} разделён между ${clean.length} учениками`);
          return OK;
        },

        rejectPayment: (id, note) => {
          const p = get().payments.find((x) => x.id === id);
          if (!p) return fail("Платёж не найден.");
          const reason = closedReason(get(), p.date);
          if (reason) return fail(reason);
          set((s) => ({ payments: s.payments.map((x) => (x.id === id ? { ...x, status: "rejected", note: note || "Отклонён администратором" } : x)) }));
          log("payment", "payments", id, `Платёж ${formatMoney(p.amount)} отклонён`);
          return OK;
        },

        requeuePayment: (id) => {
          const p = get().payments.find((x) => x.id === id);
          if (!p) return fail("Платёж не найден.");
          const reason = closedReason(get(), p.date);
          if (reason) return fail(reason);
          set((s) => ({ payments: s.payments.map((x) => (x.id === id ? { ...x, status: "pending", studentId: null, splits: undefined, note: undefined } : x)) }));
          return OK;
        },

        addAdjustment: (a) => {
          const reason = closedReason(get(), a.date);
          if (reason) return fail(reason);
          if (!a.comment.trim()) return fail("Комментарий к корректировке обязателен.");
          if (!a.amount) return fail("Укажите сумму корректировки (положительную или отрицательную).");
          set((s) => ({ adjustments: [...s.adjustments, { id: uid("adj"), ...a, comment: a.comment.trim(), createdBy: who() }] }));
          const st = studentById(get(), a.studentId);
          log("payment", "student", a.studentId, `Корректировка ${formatMoney(a.amount)} — ${st ? shortName(st) : ""}: ${a.comment.trim()}`);
          return OK;
        },

        removeAdjustment: (id) => {
          const a = get().adjustments.find((x) => x.id === id);
          if (!a) return OK;
          const reason = closedReason(get(), a.date);
          if (reason) return fail(reason);
          set((s) => ({ adjustments: s.adjustments.filter((x) => x.id !== id) }));
          return OK;
        },

        upsertTeacher: (t) => {
          const exists = get().teachers.some((x) => x.id === t.id);
          set((s) => ({ teachers: exists ? s.teachers.map((x) => (x.id === t.id ? t : x)) : [...s.teachers, t] }));
          log(exists ? "update" : "create", "teacher", t.id, `${exists ? "Обновлён" : "Добавлен"} преподаватель ${shortName(t)}`);
        },

        setTeacherStatus: (id, status) => {
          set((s) => ({ teachers: s.teachers.map((x) => (x.id === id ? { ...x, status } : x)) }));
          const t = teacherById(get(), id);
          if (t) log("status", "teacher", id, `Преподаватель ${shortName(t)} → ${status === "active" ? "Активный" : "Неактивный"}`);
        },

        generateActs: (month, rate, signerId) => {
          const s = get();
          const existing = new Set(s.acts.filter((a) => a.month === month).map((a) => a.teacherId));
          let n = s.acts.filter((a) => a.month === month).length + 1;
          const created: Act[] = [];
          for (const t of s.teachers.filter((t) => t.status === "active")) {
            if (existing.has(t.id)) continue;
            const count = teacherLessonsInMonth(s, t.id, month).length;
            if (!count) continue;
            created.push({
              id: uid("act"), number: `${String(n++).padStart(2, "0")}/${month.slice(5)}-${month.slice(2, 4)}`, teacherId: t.id, month, lessonsCount: count, rate,
              ...actCalc(count, rate, s.settings.incomePct, s.settings.fsznPct), signerId, status: "draft", source: "journal", createdAt: new Date().toISOString(),
            });
          }
          if (created.length) {
            set((st) => ({ acts: [...st.acts, ...created] }));
            log("generate", "acts", month, `Сформированы акты за ${monthGenitive(month)} (${created.length} шт.)`);
          }
          return created.length;
        },

        updateAct: (id, patch) => {
          set((s) => ({
            acts: s.acts.map((a) => {
              if (a.id !== id) return a;
              const next = { ...a, ...patch };
              return { ...next, ...actCalc(next.lessonsCount, next.rate, s.settings.incomePct, s.settings.fsznPct) };
            }),
          }));
          const a = get().acts.find((x) => x.id === id);
          const t = a ? teacherById(get(), a.teacherId) : null;
          if (a) log("update", "act", id, `Акт №${a.number} (${t ? shortName(t) : ""}) ${patch.status === "signed" ? "подписан" : "изменён"}`);
        },

        deleteAct: (id) => {
          const a = get().acts.find((x) => x.id === id);
          set((s) => ({ acts: s.acts.filter((x) => x.id !== id) }));
          if (a) log("delete", "act", id, `Удалён акт №${a.number}`);
        },

        upsertSigner: (signer) => {
          const exists = get().signers.some((x) => x.id === signer.id);
          set((s) => ({
            signers: (exists ? s.signers.map((x) => (x.id === signer.id ? signer : x)) : [...s.signers, signer]).map((x) =>
              signer.isDefault && x.id !== signer.id ? { ...x, isDefault: false } : x,
            ),
          }));
          log(exists ? "update" : "create", "signer", signer.id, `Подписант: ${signer.position} ${signer.name}`);
        },
        removeSigner: (id) => set((s) => ({ signers: s.signers.filter((x) => x.id !== id) })),

        upsertBranch: (b) => {
          const exists = get().branches.some((x) => x.id === b.id);
          set((s) => ({ branches: exists ? s.branches.map((x) => (x.id === b.id ? b : x)) : [...s.branches, b] }));
          log(exists ? "update" : "create", "branch", b.id, `${exists ? "Обновлён" : "Добавлен"} филиал «${b.name}»`);
        },

        addAcademicYear: (y) => {
          set((s) => ({ academicYears: [...s.academicYears, y] }));
          log("create", "academicYear", y.id, `Добавлен учебный год ${y.label}`);
        },
        setCurrentYear: (id) => {
          set((s) => ({ academicYears: s.academicYears.map((y) => ({ ...y, isCurrent: y.id === id })) }));
          const y = get().academicYears.find((x) => x.id === id);
          if (y) log("update", "academicYear", id, `Текущий учебный год → ${y.label}`);
        },

        addAddendum: (a) => {
          const addendum: Addendum = { ...a, id: uid("add"), createdAt: new Date().toISOString() };
          set((s) => ({ addendums: [...s.addendums, addendum] }));
          const c = get().contracts.find((x) => x.id === a.contractId);
          log("create", "addendum", addendum.id, `Доп. соглашение №${a.number} к договору ${c?.number ?? ""}`);
        },
      };
    },
    {
      // Всё состояние демо хранится в браузере: правки переживают перезагрузку, «Сбросить демо-данные» — в настройках
      name: "es-crm-demo-v2",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const keys = Object.keys(freshData()) as (keyof DataState)[];
        const data = Object.fromEntries(keys.map((k) => [k, s[k]]));
        return { ...data, theme: s.theme, role: s.role, teacherId: s.teacherId, onboardingDone: s.onboardingDone, recent: s.recent, sidebarCollapsed: s.sidebarCollapsed } as unknown as AppState;
      },
    },
  ),
);

function splitName(name: string) {
  const [lastName = "", firstName = "", middleName = ""] = name.split(" ");
  return { lastName, firstName, middleName };
}

/* ---------- Hooks ---------- */
export function useCurrentUser() {
  const role = useAppStore((s) => s.role);
  const teacherId = useAppStore((s) => s.teacherId);
  const teachers = useAppStore((s) => s.teachers);
  return useMemo(() => {
    if (role === "teacher") {
      const t = teachers.find((x) => x.id === teacherId);
      if (t) return { id: `u_${t.id}`, name: fullName(t), email: t.email, role, teacherId: t.id };
    }
    return USERS.find((u) => u.role === role) ?? USERS[0];
  }, [role, teacherId, teachers]);
}

export const useToday = () => useAppStore((s) => s.settings.today);
export const useCurMonth = () => useAppStore((s) => s.settings.today.slice(0, 7));

/** Группы, доступные текущему пользователю (преподаватель видит свои + группы, где он заменяет) */
export function useScopedGroupIds(): string[] | undefined {
  const role = useAppStore((s) => s.role);
  const teacherId = useAppStore((s) => s.teacherId);
  const groups = useAppStore((s) => s.groups);
  const lessons = useAppStore((s) => s.lessons);
  return useMemo(() => {
    if (role !== "teacher") return undefined;
    const st = useAppStore.getState();
    const subs = new Set<string>();
    for (const l of lessons) if (effectiveTeacherId(st, l) === teacherId) subs.add(l.groupId);
    return groups.filter((g) => g.teacherId === teacherId || subs.has(g.id)).map((g) => g.id);
  }, [role, teacherId, groups, lessons]);
}

export { currentRate };
