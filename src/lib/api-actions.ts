/** API-реализации действий стора. Подменяют локальные impls в режиме dataMode="api".
 *
 * Каждое действие → вызов API → refresh() (перезагрузка DataState).
 * Ошибки API (409/423/403) → toast.error с серверным message.
 */
import { toast } from "sonner";

import type { AppState, Result, ImportResult } from "./store";
import { api, ApiError } from "./api";

type S = () => AppState;

const err = (e: unknown): Result => {
  const msg = e instanceof ApiError ? e.message : "Ошибка запроса";
  toast.error(msg);
  return { ok: false, reason: msg };
};

/** Обернуть void-действие: async вызов + toast при ошибке + refresh. */
const run = (get: S, fn: () => Promise<unknown>) => {
  void fn()
    .then(() => get().refresh())
    .catch((e) => toast.error(e instanceof ApiError ? e.message : "Ошибка запроса"));
};

const runR = async (get: S, fn: () => Promise<unknown>, okMsg?: string): Promise<Result> => {
  try {
    await fn();
    if (okMsg) toast.success(okMsg);
    await get().refresh();
    return { ok: true };
  } catch (e) {
    return err(e);
  }
};

/** Действие с возвратом значения: вызов → refresh → значение | fallback при ошибке. */
const runV = async <T>(get: S, fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    const r = await fn();
    await get().refresh();
    return r;
  } catch (e) {
    err(e);
    return fallback;
  }
};

/** POST при отсутствии сущности, PATCH при наличии. */
const upsert = (path: string, id: string | null, body: unknown) =>
  id ? api.patch(`${path}/${id}/`, body) : api.post(`${path}/`, body);

export function makeApiActions(get: S): Partial<AppState> {
  return {
    /* ---------- настройки ---------- */
    setSettings: (patch) => {
      run(get, async () => {
        await api.patch("/settings/", {
          ...(patch.openingDate !== undefined ? { opening_date: patch.openingDate } : {}),
        });
        if (patch.chargeAbsent !== undefined || patch.chargeSick !== undefined || patch.chargeExcused !== undefined) {
          const s = get().settings;
          await api.post("/charge-policies/", {
            date_from: get().settings.today,
            charge_absent: patch.chargeAbsent ?? s.chargeAbsent,
            charge_sick: patch.chargeSick ?? s.chargeSick,
            charge_excused: patch.chargeExcused ?? s.chargeExcused,
          });
        }
        if (patch.incomePct !== undefined) await api.post("/tax-rates/", { kind: "income_tax", date_from: get().settings.today, pct: patch.incomePct });
        if (patch.fsznPct !== undefined) await api.post("/tax-rates/", { kind: "fszn", date_from: get().settings.today, pct: patch.fsznPct });
        if (patch.rates) await Promise.all(patch.rates.map((r) => api.post("/act-rates/", { date_from: r.from, rate: r.rate })));
      });
    },
    toggleMonthClosed: (month) => {
      const closed = get().settings.closedMonths.includes(month);
      run(get, async () => {
        if (closed) await api.post(`/months/${month}/reopen`, { reason: "Открытие месяца через CRM" });
        else await api.post(`/months/${month}/close`, {});
      });
    },

    /* ---------- ученики/договоры ---------- */
    upsertStudent: (student, contract) => {
      run(get, async () => {
        const body = {
          last_name: student.lastName, first_name: student.firstName, middle_name: student.middleName,
          birth_year: student.birthYear || null, grade: student.grade, branch: student.branchId || null,
          status: student.status, parent_name: student.parentName, parent_phone: student.parentPhone,
          parent_phone2: student.parentPhone2 ?? "", comment: student.notes ?? "",
          opening_balance: student.openingBalance,
        };
        const exists = get().students.some((s) => s.id === student.id);
        const saved = await upsert("/students", exists ? student.id : null, body);
        const sid = exists ? student.id : (saved as { id: string }).id;
        if (contract && !exists) {
          await api.post(`/students/${sid}/contracts/`, { number: contract.number, academic_year: contract.academicYearId, date: contract.date, status: "active" });
        }
      });
    },
    setStudentsStatus: (ids, status) => run(get, () => api.post("/students/bulk-status", { ids, status })),
    deleteStudent: (id) => run(get, () => api.del(`/students/${id}/`)),
    closeContract: (contractId) => run(get, () => api.post(`/contracts/${contractId}/close`, {})),

    /* ---------- группы/зачисления ---------- */
    upsertGroup: (group) => {
      run(get, async () => {
        const body = {
          code: group.code, name: group.name, direction: group.direction, branch: group.branchId,
          teacher: group.teacherId || null, academic_year: group.academicYearId || null,
          schedule: group.schedule, weekdays: group.weekdays, status: group.status,
          prices: group.prices.map((p) => ({ date_from: p.from, price: p.price })),
        };
        await upsert("/groups", get().groups.some((g) => g.id === group.id) ? group.id : null, body);
      });
    },
    addStudentsToGroup: (groupId, studentIds, from) =>
      run(get, () => Promise.all(studentIds.map((sid) => api.post(`/groups/${groupId}/enroll/`, { student_id: sid, date: from ?? get().settings.today })))),
    removeStudentFromGroup: (groupId, studentId, lastDay) =>
      run(get, () => api.post(`/groups/${groupId}/unenroll/`, { student_id: studentId, date: lastDay ?? get().settings.today })),
    transferStudent: (studentId, fromGroupId, toGroupId, date) =>
      runR(get, () => api.post("/enrollments/transfer", { student_id: studentId, from_group_id: fromGroupId, to_group_id: toGroupId, date })),

    /* ---------- журнал ---------- */
    addLesson: async (groupId, date) =>
      runV(get, async () => (await api.post<{ id: string }>("/lessons/", { group: groupId, date })).id, null),
    generateMonthLessons: async (groupId, month) =>
      runV(get, async () => (await api.post<{ created: number }>(`/groups/${groupId}/generate-lessons/`, { month })).created, 0),
    removeLesson: (lessonId) => run(get, () => api.del(`/lessons/${lessonId}/`)),
    setSubstitute: (lessonId, teacherId) => run(get, () => api.patch(`/lessons/${lessonId}/`, { substitute_teacher: teacherId })),
    setCancelled: (lessonId, cancelled) => run(get, () => api.patch(`/lessons/${lessonId}/`, { cancelled })),
    setAttendance: (lessonId, studentId, status) => run(get, () => api.put(`/lessons/${lessonId}/attendance/`, { marks: { [studentId]: status } })),
    setAttendanceBulk: (lessonId, studentIds, status) =>
      run(get, () => api.put(`/lessons/${lessonId}/attendance/`, { marks: Object.fromEntries(studentIds.map((s) => [s, status])) })),

    /* ---------- платежи ---------- */
    addPayment: (p) =>
      runR(get, () => api.post("/payments/", { student: p.studentId, date: p.date, amount: p.amount, method: p.method, payer: p.payer ?? "", comment: p.comment ?? "", status: "confirmed" })),
    deletePayment: (id) => runR(get, () => api.del(`/payments/${id}/`)),
    importStatement: (csv): Promise<ImportResult> =>
      runV(
        get,
        async () => {
          const r = await api.post<{ loaded: number; auto: number; queued: number; dups: number; closed_month?: number; bad_rows: { row: number }[] }>(
            "/payments/import", { csv });
          return { loaded: r.loaded, auto: r.auto, queued: r.queued, dups: r.dups, closed: r.closed_month ?? 0, bad: (r.bad_rows ?? []).map((x) => x.row) };
        },
        { loaded: 0, auto: 0, queued: 0, dups: 0, closed: 0, bad: [] },
      ),
    confirmPayment: (id, studentId) => runR(get, () => api.post(`/payments/${id}/confirm`, { student_id: studentId }), "Платёж подтверждён"),
    splitPayment: (id, parts) =>
      runR(get, () => api.post(`/payments/${id}/split`, { parts: parts.map((x) => ({ student_id: x.studentId, amount: x.amount })) }), "Платёж разделён"),
    rejectPayment: (id, note) => runR(get, () => api.post(`/payments/${id}/reject`, { reason: note ?? "" })),
    requeuePayment: (id) => runR(get, () => api.post(`/payments/${id}/requeue`, {})),
    addAdjustment: (a) => runR(get, () => api.post("/adjustments/", { student: a.studentId, date: a.date, amount: a.amount, comment: a.comment })),
    removeAdjustment: (id) => runR(get, () => api.del(`/adjustments/${id}/`)),

    /* ---------- преподаватели/акты ---------- */
    upsertTeacher: (t) => {
      run(get, async () => {
        const body = {
          last_name: t.lastName, first_name: t.firstName, middle_name: t.middleName, phone: t.phone,
          email: t.email, status: t.status, contract_number: t.contractNumber,
          contract_date: t.contractDate || null, subjects: t.subjects, rate: t.rate,
          passport_series: t.passport.series, passport_number: t.passport.number,
          passport_issued: t.passport.issuedBy, passport_date: t.passport.issuedAt || null,
          personal_number: t.passport.personalNumber, iban: t.bank.iban,
          bank_name: t.bank.bankName, bank_bic: t.bank.bic, address_reg: t.address,
        };
        await upsert("/teachers", get().teachers.some((x) => x.id === t.id) ? t.id : null, body);
      });
    },
    setTeacherStatus: (id, status) => run(get, () => api.post(`/teachers/${id}/status`, { status })),
    generateActs: async (month) =>
      runV(get, async () => (await api.post<{ generated: number }>("/acts/generate", { month })).generated, 0),
    updateAct: (id, patch) =>
      run(get, () =>
        api.patch(`/acts/${id}/`, {
          ...(patch.signerId !== undefined ? { signer: patch.signerId } : {}),
          ...(patch.lessonsCount !== undefined ? { lessons_count: patch.lessonsCount } : {}),
          ...(patch.rate !== undefined ? { rate: patch.rate } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        }),
      ),
    deleteAct: (id) => run(get, () => api.del(`/acts/${id}/`)),

    /* ---------- справочники ---------- */
    upsertSigner: (s) => {
      run(get, async () => {
        const body = { name: s.name, position: s.position, position_gen: s.positionGen ?? "", female: !!s.female, is_default: !!s.isDefault };
        await upsert("/signers", get().signers.some((x) => x.id === s.id) ? s.id : null, body);
      });
    },
    removeSigner: (id) => run(get, () => api.del(`/signers/${id}/`)),
    upsertBranch: (b) => {
      run(get, async () => {
        const body = { name: b.name, short_name: b.shortName, address: b.address, color: b.color };
        await upsert("/branches", get().branches.some((x) => x.id === b.id) ? b.id : null, body);
      });
    },
    addAcademicYear: (y) => run(get, () => api.post("/academic-years/", { name: y.label, start_date: y.startDate, end_date: y.endDate, is_current: y.isCurrent })),
    setCurrentYear: (id) => run(get, () => api.post(`/academic-years/${id}/set-current`, {})),

    /* ---------- документы ---------- */
    addAddendum: (a) =>
      run(get, () => api.post("/addendums/", { contract: a.contractId, number: a.number, date: a.date, template: a.templateId || null, clause: a.clause, signer: a.signerId || null, body: a.text })),

    /* аудит пишет сервер — log() в api-режиме no-op */
    log: () => {},
  };
}
