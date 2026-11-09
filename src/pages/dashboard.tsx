import * as React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRight, BookOpenCheck, Boxes, CalendarDays, FileCheck2, GraduationCap, Percent, UserPlus, Users, Wallet, Activity, AlertCircle,
} from "lucide-react";
import { useAppStore, useCurMonth, useCurrentUser, useScopedGroupIds, useToday } from "@/lib/store";
import { can } from "@/lib/rbac";
import { attendanceSeries, dashboardKpis, financeSeries, lessonMarkedCount, recentLessons, upcomingLessons, groupById, teacherById, branchById } from "@/lib/selectors";
import { cn, formatDate, formatDateTime, formatMoney, monthLabel, plural, shortName, weekdayShort } from "@/lib/utils";
import { KpiCard, PageHeader, PageSkeleton, useFakeLoading } from "@/components/shared/bits";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";

function ChartTip({ active, payload, label, money }: { active?: boolean; payload?: any[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-popover px-3 py-2 text-[12px] shadow-float">
      <div className="mb-1 font-medium capitalize">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color || p.fill }} />
            {p.name}
          </span>
          <span className="font-medium tabular">{money ? formatMoney(p.value) : `${p.value}%`}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const state = useAppStore();
  const DEMO_TODAY = useToday();
  const CURRENT_MONTH = useCurMonth();
  const user = useCurrentUser();
  const scope = useScopedGroupIds();
  const loading = useFakeLoading(300);
  const role = state.role;

  const kpi = React.useMemo(() => dashboardKpis(state, scope), [state, scope]);
  const attSeries = React.useMemo(() => attendanceSeries(state, scope), [state, scope]);
  const finSeries = React.useMemo(() => financeSeries(state), [state]);
  const today = upcomingLessons(state, DEMO_TODAY, scope, 8).filter((l) => l.date === DEMO_TODAY);
  const recent = recentLessons(state, DEMO_TODAY, scope, 6);
  const firstName = user.name.split(" ")[1] ?? user.name;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";

  if (loading) return <PageSkeleton />;

  const isTeacher = role === "teacher";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> {formatDate(DEMO_TODAY)} · {monthLabel(CURRENT_MONTH)} · учебный год 2025/2026
          </span>
        }
        actions={
          <>
            {can(role, "students.edit") && (
              <Button variant="outline" onClick={() => navigate("/students?new=1")}>
                <UserPlus /> Ученик
              </Button>
            )}
            {can(role, "finance.edit") && (
              <Button variant="outline" onClick={() => navigate("/statements?pay=1")}>
                <Wallet /> Оплата
              </Button>
            )}
            <Button onClick={() => navigate("/journal")}>
              <BookOpenCheck /> Открыть журнал
            </Button>
          </>
        }
      />

      {/* KPI */}
      <div className={cn("grid gap-3 sm:grid-cols-2", isTeacher ? "xl:grid-cols-3" : "xl:grid-cols-5")}>
        <KpiCard index={0} title="Активные ученики" value={kpi.activeStudents} icon={<Users />} tone="primary" sub={kpi.newThisMonth ? `+${kpi.newThisMonth} новых в этом месяце` : `из ${kpi.totalStudents} в реестре`} onClick={() => can(role, "students.view") && navigate("/students")} />
        <KpiCard index={1} title={isTeacher ? "Мои группы" : "Группы"} value={kpi.groups} icon={<Boxes />} sub={plural(kpi.lessonsThisMonth, "занятие", "занятия", "занятий") + " в этом месяце"} onClick={() => navigate("/groups")} />
        <KpiCard index={2} title="Посещаемость за месяц" value={`${kpi.attendanceRate}%`} icon={<Percent />} tone="success" delta={kpi.attendanceDelta} deltaLabel=" п.п." sub="к прошлому месяцу" onClick={() => navigate("/journal")} />
        {!isTeacher && (
          <>
            <KpiCard index={3} title="Сумма остатков" value={formatMoney(kpi.totalBalance)} icon={<Wallet />} tone={kpi.totalBalance < 0 ? "destructive" : "warning"} sub={kpi.debtors ? `${plural(kpi.debtors, "должник", "должника", "должников")}` : "без задолженностей"} onClick={() => navigate("/statements")} />
            <KpiCard index={4} title="Преподаватели" value={kpi.teachers} icon={<GraduationCap />} delta={kpi.paidDelta} deltaLabel="% оплат" sub={`${formatMoney(kpi.paidThisMonth)} за месяц`} onClick={() => navigate("/teachers")} />
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Attendance chart */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Посещаемость по месяцам</CardTitle>
              <CardDescription>Доля отметок «Присутствовал» от всех отметок{scope ? " в ваших группах" : ""}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/journal")}>
              Журналы <ArrowRight />
            </Button>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barSize={28}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "var(--muted-foreground)" }} className="capitalize" />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${v}%`} />
                <RTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTip />} />
                <Bar dataKey="rate" name="Посещаемость" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Today */}
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Занятия сегодня</CardTitle>
              <CardDescription>{weekdayShort(DEMO_TODAY)}, {formatDate(DEMO_TODAY)}</CardDescription>
            </div>
            <Badge variant="secondary">{today.length}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {today.length === 0 && <p className="py-6 text-center text-[12.5px] text-muted-foreground">Сегодня занятий нет</p>}
            {today.map((l, i) => {
              const g = groupById(state, l.groupId)!;
              const t = teacherById(state, l.substituteTeacherId ?? g.teacherId);
              const b = branchById(state, g.branchId);
              const m = lessonMarkedCount(state, l);
              return (
                <motion.button
                  key={l.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.04 }}
                  onClick={() => navigate(`/journal?group=${g.id}&month=${CURRENT_MONTH}`)}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                >
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: b?.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{g.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {g.schedule.split("·")[1]?.trim()} · {t ? shortName(t) : ""}{l.substituteTeacherId ? " (замена)" : ""}
                    </span>
                  </span>
                  {m.marked === 0 ? (
                    <Badge variant="warning">не отмечено</Badge>
                  ) : (
                    <Badge variant="success">
                      {m.present}/{m.total}
                    </Badge>
                  )}
                </motion.button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {!isTeacher ? (
          <Card className="xl:col-span-2">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Финансы</CardTitle>
                <CardDescription>Поступления и списания по журналам, Br</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/statements")}>
                Ведомости <ArrowRight />
              </Button>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={finSeries} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gCons" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "var(--muted-foreground)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <RTooltip content={<ChartTip money />} />
                  <Area type="monotone" dataKey="paid" name="Сдано" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gPaid)" />
                  <Area type="monotone" dataKey="consumed" name="Израсходовано" stroke="var(--chart-2)" strokeWidth={2} fill="url(#gCons)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card className="xl:col-span-2">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Последние занятия</CardTitle>
                <CardDescription>Проверьте, что все отметки проставлены</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border/60">
              {recent.map((l) => {
                const g = groupById(state, l.groupId)!;
                const m = lessonMarkedCount(state, l);
                const unmarked = m.total - m.marked;
                return (
                  <button key={l.id} onClick={() => navigate(`/journal?group=${g.id}&month=${l.date.slice(0, 7)}`)} className="flex items-center gap-3 py-2.5 text-left transition-colors hover:bg-accent/50 -mx-2 px-2 rounded-md">
                    <div className="flex size-9 flex-col items-center justify-center rounded-lg border border-border bg-muted/40 text-center leading-none">
                      <span className="text-[13px] font-semibold tabular">{l.date.slice(8)}</span>
                      <span className="text-[9.5px] uppercase text-muted-foreground">{weekdayShort(l.date)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{g.name}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        Присутствовало {m.present} из {m.total}
                      </div>
                    </div>
                    {unmarked > 0 ? (
                      <Badge variant="warning">
                        <AlertCircle /> {unmarked} без отметки
                      </Badge>
                    ) : (
                      <Badge variant="success">готово</Badge>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Activity */}
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Активность</CardTitle>
              <CardDescription>Недавние изменения</CardDescription>
            </div>
            {can(role, "audit.view") && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/audit")}>
                Все <ArrowRight />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ol className="relative flex flex-col gap-3 border-l border-border/70 pl-4">
              {state.audit.slice(0, 7).map((a, i) => (
                <motion.li key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + i * 0.03 }} className="relative">
                  <span className="absolute -left-[21px] top-1 flex size-2.5 items-center justify-center rounded-full border-2 border-background bg-primary/70" />
                  <div className="flex items-start gap-2">
                    <Avatar name={a.userName} size="xs" className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[12.5px] leading-snug">{a.description}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.userName} · {formatDateTime(a.at)}
                      </p>
                    </div>
                  </div>
                </motion.li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      {!isTeacher && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <FileCheck2 />, title: "Сформировать акты", desc: `За ${monthLabel(CURRENT_MONTH).toLowerCase()} по данным журналов`, href: "/acts?generate=1", perm: "acts.edit" as const },
            { icon: <Wallet />, title: "Ведомость по филиалу", desc: "Остатки, оплаты и списания", href: "/statements", perm: "finance.view" as const },
            { icon: <Activity />, title: "Реестр учеников", desc: "Договоры, фильтры, печать", href: "/students", perm: "students.view" as const },
            { icon: <BookOpenCheck />, title: "Печать журнала", desc: "PDF по шаблону за месяц", href: "/journal", perm: "journal.view" as const },
          ]
            .filter((q) => can(role, q.perm))
            .map((q, i) => (
              <motion.button
                key={q.title}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
                whileHover={{ y: -2 }}
                onClick={() => navigate(q.href)}
                className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4 text-left shadow-card transition-shadow hover:shadow-float"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">{q.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{q.title}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{q.desc}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </motion.button>
            ))}
        </div>
      )}
    </div>
  );
}
