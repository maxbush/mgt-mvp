/** Хуки серверных вычислений: в api-режиме данные приходят с backend'а,
 * в demo — те же селекторы локально. Интерфейс для страниц единый.
 */
import { useEffect, useMemo, useState } from "react";

import { fetchDashboard, fetchStatement, type ServerStatementRow } from "./api";
import { attendanceSeries, dashboardKpis, financeSeries, groupById, statementRows, type StatementRow } from "./selectors";
import { useAppStore } from "./store";
import type { Group, Student } from "./types";
import { monthLabel } from "./utils";

function mapStatementRow(state: ReturnType<typeof useAppStore.getState>, r: ServerStatementRow, month: string): StatementRow {
  const parts = (r.student.name ?? "").split(" ");
  const student: Student = state.students.find((s) => s.id === r.student.id) ?? {
    id: r.student.id, lastName: parts[0] ?? "", firstName: parts[1] ?? "", middleName: "",
    birthYear: 0, grade: r.student.grade ?? "", branchId: "", status: (r.student.status as Student["status"]) ?? "active",
    parentName: "", parentPhone: "", createdAt: "", openingBalance: 0,
  };
  const groups = (r.groups ?? []).map((g) => groupById(state, g.id)).filter((g): g is Group => !!g);
  return {
    month, label: monthLabel(month),
    opening: r.opening, paid: r.paid, consumedCount: r.consumedCount, consumed: r.consumed, closing: r.closing,
    student, groups, byGroup: r.byGroup ?? {}, multi: !!r.multi, foreign: !!r.foreign,
  };
}

/** Строки ведомости: api → GET /statements, demo → statementRows. */
export function useStatementRows(sheetId: string, month: string): StatementRow[] {
  const state = useAppStore();
  const isApi = state.dataMode === "api";
  const [server, setServer] = useState<StatementRow[] | null>(null);

  // зависимость от срезов данных → refetch после refresh()
  const dataRev = state.payments.length + state.adjustments.length + state.lessons.length;
  useEffect(() => {
    if (!isApi || !sheetId) { setServer(null); return; }
    let alive = true;
    fetchStatement(sheetId, month)
      .then((r) => { if (alive) setServer(r.rows.map((x) => mapStatementRow(state, x, month))); })
      .catch(() => { if (alive) setServer([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApi, sheetId, month, dataRev]);

  return useMemo(() => {
    if (!isApi) return sheetId ? statementRows(state, sheetId, month) : [];
    return server ?? [];
  }, [isApi, state, sheetId, month, server]);
}

export interface DashboardData {
  kpis: ReturnType<typeof dashboardKpis>;
  attendanceSeries: ReturnType<typeof attendanceSeries>;
  financeSeries: ReturnType<typeof financeSeries>;
}

/** KPI + серии дашборда: api → GET /dashboard, demo → локальные селекторы. */
export function useDashboardData(scope?: string[]): DashboardData {
  const state = useAppStore();
  const isApi = state.dataMode === "api";
  const [server, setServer] = useState<DashboardData | null>(null);

  const dataRev = state.payments.length + state.lessons.length + state.students.length + state.groups.length;
  useEffect(() => {
    if (!isApi) { setServer(null); return; }
    let alive = true;
    fetchDashboard()
      .then((d) => {
        if (!alive) return;
        setServer({
          kpis: d.kpis,
          attendanceSeries: d.attendanceSeries.map((x) => ({ month: x.month, label: monthLabel(x.month).slice(0, 3), rate: x.rate, present: x.present, total: x.total })),
          financeSeries: d.financeSeries.map((x) => ({ month: x.month, label: monthLabel(x.month).slice(0, 3), paid: x.paid, consumed: x.consumed })),
        });
      })
      .catch(() => { if (alive) setServer(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApi, dataRev]);

  return useMemo(() => {
    if (isApi && server) return server;
    return { kpis: dashboardKpis(state, scope), attendanceSeries: attendanceSeries(state, scope), financeSeries: financeSeries(state) };
  }, [isApi, server, state, scope]);
}
