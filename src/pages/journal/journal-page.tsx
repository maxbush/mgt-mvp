import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  BookOpenCheck, CalendarPlus, Check, Copy, Phone, Printer, Repeat, Trash2, Users, UserRoundX, CheckCheck, Eraser, Info, Ban, Lock, Hand, Table2, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { AttendanceStatus, Lesson } from "@/lib/types";
import { useAppStore, useCurMonth, useScopedGroupIds } from "@/lib/store";
import { can } from "@/lib/rbac";
import { WEEKDAY_SHORT } from "@/lib/mock-data";
import {
  ATTENDANCE_CYCLE, ATTENDANCE_META, PRINT_MARK, attKey, attendanceStats, branchById, effectiveTeacherId, groupLessons, groupStudentsInMonth, isEnrolledOn, lessonEditCheck, lessonState, teacherById,
} from "@/lib/selectors";
import { cn, copyToClipboard, formatDate, formatPhone, fullName, gradeLabel, monthLabel, plural, shortName, telHref, weekdayShort } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SimpleSelect } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/popover";
import { Avatar, Kbd } from "@/components/ui/misc";
import { MonthPicker, PageHeader, PageSkeleton, useFakeLoading } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PrintPreview, useDefaultSigner } from "@/components/shared/print-preview";
import { JournalDoc } from "@/components/print/journal-doc";

const STATUSES: AttendanceStatus[] = ["present", "absent", "sick", "excused"];

function useMediaQuery(q: string) {
  const [m, setM] = React.useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    on();
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/** Режим «по занятию»: крупные кнопки, отметка одной рукой на телефоне */
function LessonMode({
  lessons, students, activeId, setActiveId, mark, bulk, check,
}: {
  lessons: Lesson[];
  students: ReturnType<typeof groupStudentsInMonth>;
  activeId: string | null;
  setActiveId: (id: string) => void;
  mark: (l: Lesson, sid: string, st: AttendanceStatus | null) => void;
  bulk: (l: Lesson, st: AttendanceStatus | null, onlyUnmarked?: boolean) => void;
  check: (l: Lesson) => { ok: boolean; reason?: string };
}) {
  const state = useAppStore();
  const today = state.settings.today;
  const fallback = [...lessons].reverse().find((x) => x.date <= today && !x.cancelled) ?? lessons[0];
  const l = lessons.find((x) => x.id === activeId) ?? fallback;
  const idx = lessons.indexOf(l);
  const chk = check(l);
  const list = students.filter((s) => isEnrolledOn(state, s.id, l.groupId, l.date) || state.attendance[attKey(l.id, s.id)]);
  const marked = list.filter((s) => state.attendance[attKey(l.id, s.id)]).length;
  const present = list.filter((s) => state.attendance[attKey(l.id, s.id)] === "present").length;
  const sub = l.substituteTeacherId ? teacherById(state, l.substituteTeacherId) : null;
  const chipsRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    chipsRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [l.id]);
  return (
    <div className="pb-32">
      <div ref={chipsRef} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 scrollbar-thin" role="group" aria-label="Занятия месяца">
        {lessons.map((x) => (
          <button
            key={x.id}
            data-active={x.id === l.id}
            onClick={() => setActiveId(x.id)}
            className={cn(
              "relative flex h-14 min-w-14 flex-none flex-col items-center justify-center rounded-xl border text-center transition-colors",
              x.id === l.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
              x.cancelled && "opacity-50",
            )}
          >
            <span className={cn("text-[15px] font-semibold tabular leading-none", x.cancelled && "line-through")}>{x.date.slice(8)}.{x.date.slice(5, 7)}</span>
            <span className="mt-0.5 text-[10px] uppercase opacity-80">{weekdayShort(x.date)}</span>
            {lessonState(state, x) === "held" && <span className={cn("absolute right-1.5 top-1.5 size-1.5 rounded-full", x.id === l.id ? "bg-white" : "bg-success")} />}
            {x.date < today && lessonState(state, x) === "planned" && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />}
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="text-[15px] font-semibold">{formatDate(l.date)}, {weekdayShort(l.date)}</div>
        <div className="text-[12.5px] text-muted-foreground">
          {sub ? <span className="text-amber-700 dark:text-amber-300">замена: {shortName(sub)}</span> : `отмечено ${marked} из ${list.length}`}
        </div>
      </div>
      {!chk.ok && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px]">
          <Lock className="mt-0.5 size-3.5 shrink-0" /> <span>{chk.reason}</span>
        </div>
      )}
      <ul className="overflow-hidden rounded-xl border border-border/70 bg-card">
        {list.map((s) => {
          const cur = state.attendance[attKey(l.id, s.id)];
          return (
            <li key={s.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-2 pl-3 pr-2 last:border-0">
              <div className="min-w-0">
                <div className="text-[14px] font-medium leading-tight">{s.lastName} {s.firstName}</div>
                <a href={telHref(s.parentPhone)} className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Phone className="size-3" />{formatPhone(s.parentPhone)}</a>
              </div>
              <div className="flex flex-none gap-1" role="group" aria-label={`Отметка: ${fullName(s)}`}>
                {STATUSES.map((k) => (
                  <button
                    key={k}
                    aria-pressed={cur === k}
                    aria-label={`${fullName(s)}: ${ATTENDANCE_META[k].label}`}
                    onClick={() => mark(l, s.id, cur === k ? null : k)}
                    className={cn(
                      "size-11 rounded-xl border-2 text-[16px] font-bold transition-transform active:scale-90",
                      cur === k ? ATTENDANCE_META[k].className.replace("/15", "").replace("/12", "").replace("/20", "") + " ring-2 ring-offset-1 ring-offset-card" : "border-border bg-background text-muted-foreground",
                      cur === k && k === "present" && "!bg-success !text-white",
                      cur === k && k === "absent" && "!bg-destructive !text-white",
                      cur === k && k === "sick" && "!bg-warning !text-black",
                      cur === k && k === "excused" && "!bg-info !text-white",
                    )}
                  >
                    {ATTENDANCE_META[k].short}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
        {list.length === 0 && <li className="p-6 text-center text-[13px] text-muted-foreground">В этот день в группе нет учеников</li>}
      </ul>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-card/95 p-2.5 shadow-float backdrop-blur" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
        <Button variant="outline" size="icon" className="size-12" disabled={idx <= 0} onClick={() => setActiveId(lessons[idx - 1].id)} aria-label="Предыдущее занятие"><ChevronLeft /></Button>
        <Button className="h-12 flex-1 text-[15px]" disabled={l.cancelled} onClick={() => { bulk(l, "present", true); }}>
          <CheckCheck /> Все пришли <span className="ml-1 text-[12px] opacity-80">({present}/{list.length})</span>
        </Button>
        <Button variant="outline" size="icon" className="size-12" disabled={idx >= lessons.length - 1} onClick={() => setActiveId(lessons[idx + 1].id)} aria-label="Следующее занятие"><ChevronRight /></Button>
      </div>
    </div>
  );
}

function ParentPopover({ studentId, children }: { studentId: string; children: React.ReactNode }) {
  const student = useAppStore((s) => s.students.find((x) => x.id === studentId));
  const navigate = useNavigate();
  const role = useAppStore((s) => s.role);
  if (!student) return <>{children}</>;
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex items-center gap-2.5">
          <Avatar name={fullName(student)} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">{fullName(student)}</div>
            <div className="text-[11.5px] text-muted-foreground">{gradeLabel(student.grade)}{student.birthYear ? ` · ${student.birthYear} г.р.` : ""}</div>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Законный представитель</div>
          <div className="mt-0.5 text-[13px] font-medium">{student.parentName}</div>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="flex-1" asChild>
              <a href={telHref(student.parentPhone)}>
                <Phone /> {formatPhone(student.parentPhone)}
              </a>
            </Button>
            <Tooltip content="Скопировать">
              <Button size="icon-sm" variant="outline" onClick={async () => { await copyToClipboard(formatPhone(student.parentPhone)); toast.success("Телефон скопирован"); }}>
                <Copy />
              </Button>
            </Tooltip>
          </div>
          {student.parentPhone2 && (
            <a href={telHref(student.parentPhone2)} className="mt-1.5 block text-[12px] text-muted-foreground hover:text-primary">
              доп.: {formatPhone(student.parentPhone2)}
            </a>
          )}
        </div>
        {student.notes && <p className="mt-2 rounded-md bg-warning/15 px-2.5 py-1.5 text-[12px] text-amber-800 dark:text-amber-200">{student.notes}</p>}
        {can(role, "students.view") && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => navigate(`/students/${student.id}`)}>
            Открыть карточку
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function JournalPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const state = useAppStore();
  const { role, setAttendance, setAttendanceBulk, addLesson, removeLesson, setSubstitute, setCancelled, generateMonthLessons, log } = state;
  const scope = useScopedGroupIds();
  const loading = useFakeLoading(250);
  const canEdit = can(role, "journal.edit");
  const isAdmin = role === "admin";
  const nowMonth = useCurMonth();
  const [mobileMode, setMobileMode] = React.useState<"lesson" | "table">(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "lesson" : "table"));
  const [lessonId, setLessonId] = React.useState<string | null>(null);
  /** Можно ли править отметки на занятии (закрытый месяц, чужое занятие, окно «текущий + предыдущий месяц») */
  const check = (l: Lesson) => (canEdit ? lessonEditCheck(state, l, role, state.teacherId) : { ok: false, reason: "У вашей роли журнал доступен только для чтения." });
  const teacherOf = (l: Lesson) => effectiveTeacherId(state, l);
  const narrow = useMediaQuery("(max-width: 767px)");

  const groups = React.useMemo(() => state.groups.filter((g) => g.status === "active" && (!scope || scope.includes(g.id))), [state.groups, scope]);
  const groupId = params.get("group") && groups.some((g) => g.id === params.get("group")) ? params.get("group")! : groups[0]?.id ?? "";
  const month = params.get("month") ?? nowMonth;
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };

  const group = state.groups.find((g) => g.id === groupId);
  const branch = group ? branchById(state, group.branchId) : undefined;
  const teacher = group ? teacherById(state, group.teacherId) : undefined;
  const lessons = React.useMemo(() => (group ? groupLessons(state, group.id, month) : []), [state, group, month]);

  // ученики, числившиеся в группе в месяце (по датам зачисления); неактивные — только с историческими отметками
  const students = React.useMemo(() => (group ? groupStudentsInMonth(state, group.id, month) : []), [group, state.students, state.enrollments, state.attendance, state.lessons, month]);

  const [focus, setFocus] = React.useState<{ r: number; c: number } | null>(null);
  const [substituteFor, setSubstituteFor] = React.useState<Lesson | null>(null);
  const [deleteLesson, setDeleteLesson] = React.useState<Lesson | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [newDate, setNewDate] = React.useState(`${month}-01`);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const defaultSigner = useDefaultSigner();
  const [signer, setSigner] = React.useState(defaultSigner);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const pendingRef = React.useRef<Set<string>>(new Set());
  const timerRef = React.useRef<number | undefined>(undefined);

  const flushAudit = React.useCallback(() => {
    if (!group || pendingRef.current.size === 0) return;
    const dates = [...pendingRef.current]
      .map((id) => state.lessons.find((l) => l.id === id)?.date)
      .filter(Boolean)
      .sort()
      .map((d) => formatDate(d!));
    log("attendance", "journal", group.id, `Отметки посещаемости: ${group.name}, ${dates.join(", ")}`);
    pendingRef.current.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, state.lessons]);

  React.useEffect(() => () => flushAudit(), [flushAudit]);

  const mark = (lesson: Lesson, studentId: string, status: AttendanceStatus | null) => {
    const chk = check(lesson);
    if (!chk.ok) {
      toast.error("Нельзя изменить отметку", { description: chk.reason });
      return;
    }
    if (!isEnrolledOn(state, studentId, lesson.groupId, lesson.date)) {
      toast.error("Ученик не зачислен в группу на эту дату");
      return;
    }
    setAttendance(lesson.id, studentId, status);
    setSavedAt(new Date());
    pendingRef.current.add(lesson.id);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flushAudit, 2500);
  };
  const cycle = (lesson: Lesson, studentId: string) => {
    const cur = state.attendance[attKey(lesson.id, studentId)] ?? null;
    const idx = ATTENDANCE_CYCLE.indexOf(cur);
    mark(lesson, studentId, ATTENDANCE_CYCLE[(idx + 1) % ATTENDANCE_CYCLE.length]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!focus || !students.length || !lessons.length) return;
    const { r, c } = focus;
    const move = (nr: number, nc: number) => {
      e.preventDefault();
      const f = { r: Math.max(0, Math.min(students.length - 1, nr)), c: Math.max(0, Math.min(lessons.length - 1, nc)) };
      setFocus(f);
      gridRef.current?.querySelector<HTMLElement>(`[data-cell="${f.r}-${f.c}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    if (e.key === "ArrowRight" || e.key === "Tab" && !e.shiftKey) return move(r, c + 1);
    if (e.key === "ArrowLeft" || e.key === "Tab" && e.shiftKey) return move(r, c - 1);
    if (e.key === "ArrowDown") return move(r + 1, c);
    if (e.key === "ArrowUp") return move(r - 1, c);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return cycle(lessons[c], students[r].id);
    }
    if (["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      mark(lessons[c], students[r].id, STATUSES[Number(e.key) - 1]);
      return move(r + 1, c);
    }
    if (["п", "p"].includes(e.key.toLowerCase())) { mark(lessons[c], students[r].id, "present"); return move(r + 1, c); }
    if (["н", "h"].includes(e.key.toLowerCase())) { mark(lessons[c], students[r].id, "absent"); return move(r + 1, c); }
    if (["б", ","].includes(e.key.toLowerCase())) { mark(lessons[c], students[r].id, "sick"); return move(r + 1, c); }
    if (["у", "e"].includes(e.key.toLowerCase())) { mark(lessons[c], students[r].id, "excused"); return move(r + 1, c); }
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      e.preventDefault();
      mark(lessons[c], students[r].id, null);
    }
  };

  // derived stats
  const stats = group ? attendanceStats(state, { month, groupId: group.id }) : null;
  const presentPerLesson = lessons.map((l) => students.filter((s) => state.attendance[attKey(l.id, s.id)] === "present").length);
  const markedPerLesson = lessons.map((l) => students.filter((s) => !!state.attendance[attKey(l.id, s.id)]).length);
  const unmarkedLessons = lessons.filter((l, i) => markedPerLesson[i] === 0 && !l.cancelled && l.date <= state.settings.today).length;
  const bulk = (l: Lesson, status: AttendanceStatus | null, onlyUnmarked = false) => {
    const chk = check(l);
    if (!chk.ok) return toast.error("Нельзя изменить отметки", { description: chk.reason });
    const ids = students
      .filter((s) => isEnrolledOn(state, s.id, l.groupId, l.date) && s.status === "active")
      .filter((s) => !onlyUnmarked || !state.attendance[attKey(l.id, s.id)])
      .map((s) => s.id);
    setAttendanceBulk(l.id, ids, status);
    setSavedAt(new Date());
  };
  const suggestedDates = React.useMemo(() => {
    if (!group) return [];
    const [y, m] = month.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const have = new Set(lessons.map((l) => l.date));
    const out: string[] = [];
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m - 1, d);
      const iso = `${month}-${String(d).padStart(2, "0")}`;
      if (group.weekdays.includes(date.getDay()) && !have.has(iso)) out.push(iso);
    }
    return out;
  }, [group, month, lessons]);

  if (loading) return <PageSkeleton />;

  if (!groups.length || !group) {
    return (
      <EmptyState
        title="Нет доступных групп"
        description={role === "teacher" ? "За вами пока не закреплены группы. Обратитесь к администратору." : "Создайте группу, чтобы вести журнал посещаемости."}
        action={role !== "teacher" ? <Button onClick={() => navigate("/groups")}>К группам</Button> : undefined}
      />
    );
  }

  const otherTeachers = state.teachers.filter((t) => t.status === "active" && t.id !== group.teacherId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Журнал посещаемости"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: branch?.color }} />
              {branch?.name}
            </span>
            · {teacher ? shortName(teacher) : ""} · {group.schedule}
          </span>
        }
        actions={
          <>
            {savedAt && (
              <span className="hidden items-center gap-1 text-[12px] text-success sm:inline-flex animate-in fade-in-0">
                <Check className="size-3.5" /> Сохранено {savedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {can(role, "groups.view") && role !== "teacher" && (
              <Button variant="outline" onClick={() => navigate(`/groups/${group.id}`)}>
                <Users /> Состав
              </Button>
            )}
            <Button variant="outline" onClick={() => setPrintOpen(true)}>
              <Printer /> Печать
            </Button>
            {canEdit && (
              <Popover open={addOpen} onOpenChange={setAddOpen}>
                <PopoverTrigger asChild>
                  <Button>
                    <CalendarPlus /> Занятие
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <Field label="Дата занятия">
                    <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  </Field>
                  {suggestedDates.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">По расписанию</div>
                      <div className="flex flex-wrap gap-1">
                        {suggestedDates.slice(0, 10).map((d) => (
                          <button key={d} onClick={() => setNewDate(d)} className={cn("rounded-md border px-2 py-1 text-[12px] tabular transition-colors hover:bg-accent", newDate === d && "border-primary bg-primary/10 text-primary")}>
                            {d.slice(8)} {weekdayShort(d)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    className="mt-3 w-full"
                    size="sm"
                    onClick={async () => {
                      if (state.settings.closedMonths.includes(newDate.slice(0, 7))) return toast.error("Месяц закрыт", { description: "Добавлять занятия в закрытый месяц нельзя. Откройте месяц в «Ведомостях оплат»." });
                      const id = await addLesson(group.id, newDate);
                      if (!id) return toast.error("Занятие на эту дату уже есть");
                      toast.success(`Добавлено занятие ${formatDate(newDate)}`);
                      if (!newDate.startsWith(month)) setParam("month", newDate.slice(0, 7));
                      setAddOpen(false);
                    }}
                  >
                    Добавить одну дату
                  </Button>
                  <Button
                    className="mt-2 w-full"
                    size="sm"
                    variant="outline"
                    disabled={!suggestedDates.length}
                    onClick={async () => {
                      if (state.settings.closedMonths.includes(month)) return toast.error("Месяц закрыт", { description: "Откройте месяц, чтобы добавить занятия." });
                      const n = await generateMonthLessons(group.id, month);
                      toast.success(n ? `Добавлено занятий по расписанию: ${n}` : "Все занятия по расписанию уже созданы");
                      setAddOpen(false);
                    }}
                  >
                    Все по расписанию на {monthLabel(month).toLowerCase()} ({suggestedDates.length})
                  </Button>
                </PopoverContent>
              </Popover>
            )}
          </>
        }
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={group.id} onValueChange={(v) => setParam("group", v)}>
          <SelectTrigger size="sm" className="h-8 w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {state.branches
              .filter((b) => groups.some((g) => g.branchId === b.id))
              .map((b) => (
                <React.Fragment key={b.id}>
                  <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{b.shortName}</div>
                  {groups.filter((g) => g.branchId === b.id).map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </React.Fragment>
              ))}
          </SelectContent>
        </Select>
        <MonthPicker value={month} onChange={(m) => setParam("month", m)} min="2026-09" />
        <div className="inline-flex rounded-lg border border-border p-0.5 md:hidden" role="group" aria-label="Вид журнала">
          <button onClick={() => setMobileMode("lesson")} aria-pressed={mobileMode === "lesson"} className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium", mobileMode === "lesson" && "bg-primary text-primary-foreground")}><Hand className="size-3.5" /> По занятию</button>
          <button onClick={() => setMobileMode("table")} aria-pressed={mobileMode === "table"} className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium", mobileMode === "table" && "bg-primary text-primary-foreground")}><Table2 className="size-3.5" /> Таблица</button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="h-7 px-2 tabular">{plural(lessons.length, "занятие", "занятия", "занятий")}</Badge>
          <Badge variant="outline" className="h-7 px-2 tabular">{students.length} уч.</Badge>
          <Badge variant={stats && stats.rate >= 80 ? "success" : "warning"} className="h-7 px-2 tabular">посещаемость {stats?.rate ?? 0}%</Badge>
          {unmarkedLessons > 0 && <Badge variant="warning" className="h-7 px-2">{plural(unmarkedLessons, "занятие", "занятия", "занятий")} без отметок</Badge>}
        </div>
      </div>

      {/* Grid */}
      {lessons.length === 0 ? (
        <EmptyState
          title={`В ${monthLabel(month).toLowerCase()} занятий нет`}
          description="Добавьте первое занятие — даты по расписанию группы будут предложены автоматически."
          action={canEdit ? <Button onClick={() => setAddOpen(true)}><CalendarPlus /> Добавить занятие</Button> : undefined}
        />
      ) : narrow && mobileMode === "lesson" ? (
        <LessonMode lessons={lessons} students={students} activeId={lessonId} setActiveId={setLessonId} mark={mark} bulk={bulk} check={check} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
          <div
            ref={gridRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(null); }}
            className="relative max-h-[calc(100dvh-320px)] overflow-auto outline-none scrollbar-thin focus-visible:ring-2 focus-visible:ring-ring/30 ring-inset"
          >
            <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 h-14 w-[240px] min-w-[240px] border-b border-r border-border/70 bg-card px-3 text-left text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                    Ученик
                  </th>
                  {lessons.map((l, c) => {
                    const sub = l.substituteTeacherId ? teacherById(state, l.substituteTeacherId) : null;
                    const unmarked = markedPerLesson[c] === 0;
                    const chk = check(l);
                    return (
                      <th key={l.id} className={cn("sticky top-0 z-20 h-14 w-11 min-w-11 border-b border-border/70 bg-card p-0 text-center font-medium", focus?.c === c && "bg-primary/[0.06]", l.cancelled && "bg-muted/60")}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className={cn("group/h relative flex h-full w-full flex-col items-center justify-center gap-0 leading-none transition-colors hover:bg-accent", (unmarked || l.date > state.settings.today) && "text-muted-foreground")} title={l.cancelled ? "Занятие не состоялось" : chk.ok ? undefined : chk.reason}>
                              <span className={cn("text-[14px] font-semibold tabular", l.cancelled && "line-through")}>{l.date.slice(8)}</span>
                              <span className="text-[10px] uppercase text-muted-foreground">{weekdayShort(l.date)}</span>
                              {sub && <span className="mt-0.5 size-1.5 rounded-full bg-warning" title={`Замена: ${shortName(sub)}`} />}
                              {!chk.ok && !l.cancelled && <Lock className="absolute right-0.5 top-0.5 size-2.5 text-muted-foreground/70" />}
                              {l.cancelled && <Ban className="absolute right-0.5 top-0.5 size-2.5 text-muted-foreground" />}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center" className="w-60">
                            <DropdownMenuLabel className="normal-case tracking-normal">
                              {formatDate(l.date)}, {WEEKDAY_SHORT[new Date(l.date).getDay()]}
                              <div className="mt-0.5 text-[11.5px] font-normal">
                                {sub ? <span className="text-amber-700 dark:text-amber-300">Замена: {shortName(sub)}</span> : teacher ? shortName(teacher) : ""}
                              </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {canEdit && (
                              <>
                                <DropdownMenuItem onClick={() => { bulk(l, "present", true); toast.success("Неотмеченные — присутствовали"); }}>
                                  <CheckCheck /> Все присутствовали
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => bulk(l, "absent", true)}>
                                  <UserRoundX /> Неотмеченных → Н
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => bulk(l, null)}>
                                  <Eraser /> Очистить отметки
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (!isAdmin && teacherOf(l) !== state.teacherId) return toast.error("Нельзя изменить", { description: "«Не состоялось» может отметить преподаватель занятия или администратор." });
                                    if (state.settings.closedMonths.includes(l.date.slice(0, 7))) return toast.error("Месяц закрыт", { description: "Журналы за закрытый месяц не редактируются." });
                                    setCancelled(l.id, !l.cancelled);
                                    toast.success(l.cancelled ? "Занятие возвращено" : "Занятие не состоялось", { description: l.cancelled ? undefined : "Списаний и записи в акт не будет" });
                                  }}
                                >
                                  <Ban /> {l.cancelled ? "Вернуть в расписание" : "Не состоялось"}
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <>
                                    <DropdownMenuItem onClick={() => setSubstituteFor(l)}>
                                      <Repeat /> Замена преподавателя
                                    </DropdownMenuItem>
                                    <DropdownMenuItem destructive onClick={() => setDeleteLesson(l)}>
                                      <Trash2 /> Удалить занятие
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            )}
                            {!canEdit && <DropdownMenuItem disabled>Только просмотр</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 top-0 z-30 h-14 w-16 min-w-16 border-b border-l border-border/70 bg-card px-2 text-center text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
                    Итого
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, r) => {
                  const total = lessons.filter((l) => state.attendance[attKey(l.id, s.id)] === "present").length;
                  const marked = lessons.filter((l) => !!state.attendance[attKey(l.id, s.id)]).length;
                  return (
                    <tr key={s.id} className="group/row">
                      <td className={cn("sticky left-0 z-10 border-b border-r border-border/60 bg-card px-2 py-1 transition-colors group-hover/row:bg-muted/40", focus?.r === r && "bg-primary/[0.04]", s.status === "inactive" && "opacity-60")}>
                        <ParentPopover studentId={s.id}>
                          <button className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent">
                            <span className="w-4 text-[11px] tabular text-muted-foreground">{r + 1}</span>
                            <Avatar name={fullName(s)} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">{s.lastName} {s.firstName}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                <Phone className="mr-0.5 inline size-2.5" />
                                {formatPhone(s.parentPhone)}
                              </span>
                            </span>
                          </button>
                        </ParentPopover>
                      </td>
                      {lessons.map((l, c) => {
                        const st = state.attendance[attKey(l.id, s.id)];
                        const isFocus = focus?.r === r && focus?.c === c;
                        const enrolled = isEnrolledOn(state, s.id, l.groupId, l.date);
                        if (!enrolled && !st) {
                          return (
                            <td key={l.id} className="border-b border-border/60 p-0.5 text-center" data-cell={`${r}-${c}`}>
                              <span title="Не зачислен на эту дату" className="mx-auto flex size-9 items-center justify-center rounded-md bg-muted/40 text-[12px] text-muted-foreground/40">·</span>
                            </td>
                          );
                        }
                        const chk = check(l);
                        return (
                          <td key={l.id} className={cn("border-b border-border/60 p-0.5 text-center", focus?.c === c && "bg-primary/[0.03]", l.cancelled && "bg-muted/40")} data-cell={`${r}-${c}`}>
                            <Tooltip content={st ? ATTENDANCE_META[st].label : chk.ok ? "Нажмите для отметки" : chk.reason} delay={500}>
                              <button
                                tabIndex={-1}
                                aria-disabled={!chk.ok}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setFocus({ r, c }); gridRef.current?.focus({ preventScroll: true }); cycle(l, s.id); }}
                                className={cn(
                                  "mx-auto flex size-9 items-center justify-center rounded-md border text-[13px] font-semibold transition-all duration-100 select-none",
                                  st ? ATTENDANCE_META[st].className : "border-dashed border-border/80 text-transparent hover:border-border hover:bg-muted/50",
                                  chk.ok ? "active:scale-90" : "cursor-not-allowed opacity-80",
                                  l.cancelled && "opacity-40",
                                  isFocus && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                                )}
                              >
                                {st ? ATTENDANCE_META[st].short : "·"}
                              </button>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 border-b border-l border-border/60 bg-card px-2 text-center tabular">
                        <span className="font-semibold">{total}</span>
                        <span className="text-muted-foreground">/{marked}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky bottom-0 left-0 z-30 border-r border-t border-border/70 bg-muted/80 px-3 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">Присутствовало</td>
                  {presentPerLesson.map((n, c) => (
                    <td key={c} className="sticky bottom-0 z-20 border-t border-border/70 bg-muted/80 py-2 text-center text-[13px] font-semibold tabular backdrop-blur">
                      {markedPerLesson[c] ? n : <span className="text-muted-foreground/50">—</span>}
                    </td>
                  ))}
                  <td className="sticky bottom-0 right-0 z-30 border-l border-t border-border/70 bg-muted/80 px-2 py-2 text-center text-[13px] font-semibold tabular backdrop-blur">
                    {presentPerLesson.reduce((a, b) => a + b, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
        {STATUSES.map((k, i) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-flex size-5 items-center justify-center rounded border text-[10.5px] font-semibold", ATTENDANCE_META[k].className)}>{ATTENDANCE_META[k].short}</span>
            {ATTENDANCE_META[k].label}
            <Kbd>{i + 1}</Kbd>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Info className="size-3.5" /> Клик — переключить статус · стрелки — навигация · <Kbd>⌫</Kbd> — очистить
        </span>
        <span className="inline-flex items-center gap-1.5">
          <BookOpenCheck className="size-3.5" /> Списываются:{" "}
          {["П", state.settings.chargeAbsent && "Н", state.settings.chargeSick && "Б", state.settings.chargeExcused && "У"].filter(Boolean).join(", ")} (настройка в «Настройках»)
        </span>
      </div>

      {/* Substitute dialog */}
      <Dialog open={!!substituteFor} onOpenChange={(o) => !o && setSubstituteFor(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Замена преподавателя</DialogTitle>
            <DialogDescription>
              Занятие {substituteFor && formatDate(substituteFor.date)} · {group.name}. Замена учитывается при формировании актов.
            </DialogDescription>
          </DialogHeader>
          <Field label="Преподаватель на замене">
            <SimpleSelect
              value={substituteFor?.substituteTeacherId ?? "__none"}
              onValueChange={(v) => {
                if (!substituteFor) return;
                setSubstitute(substituteFor.id, v === "__none" ? null : v);
                setSubstituteFor({ ...substituteFor, substituteTeacherId: v === "__none" ? null : v });
              }}
              options={[{ value: "__none", label: `Без замены (${teacher ? shortName(teacher) : "—"})` }, ...otherTeachers.map((t) => ({ value: t.id, label: fullName(t) }))]}
            />
          </Field>
          <DialogFooter>
            <Button onClick={() => { setSubstituteFor(null); toast.success("Замена сохранена"); }}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteLesson}
        onOpenChange={(o) => !o && setDeleteLesson(null)}
        title="Удалить занятие?"
        description={`Занятие ${deleteLesson ? formatDate(deleteLesson.date) : ""} и все отметки по нему будут удалены. Остатки учеников пересчитаются автоматически.`}
        confirmLabel="Удалить"
        destructive
        onConfirm={() => {
          if (deleteLesson) removeLesson(deleteLesson.id);
          setDeleteLesson(null);
          toast.success("Занятие удалено");
        }}
      />

      <PrintPreview
        open={printOpen}
        onOpenChange={setPrintOpen}
        title="Печать журнала"
        description={`${group.name} · ${monthLabel(month)}`}
        orientation="landscape"
        signer={signer}
        onSignerChange={setSigner}
      >
        <JournalDoc
          groupName={group.name}
          branchName={branch?.name ?? ""}
          teacherName={teacher ? fullName(teacher) : ""}
          schedule={group.schedule}
          month={month}
          dates={lessons.map((l) => l.date)}
          rows={students.map((s) => ({
            name: fullName(s),
            marks: lessons.map((l) => {
              const st = state.attendance[attKey(l.id, s.id)];
              return st ? PRINT_MARK[st] : null;
            }),
            total: lessons.filter((l) => state.attendance[attKey(l.id, s.id)] === "present").length,
          }))}
          presentPerLesson={presentPerLesson}
          substitutes={Object.fromEntries(lessons.filter((l) => l.substituteTeacherId).map((l) => [l.date, shortName(teacherById(state, l.substituteTeacherId!)!)]))}
          signer={signer}
        />
      </PrintPreview>
    </div>
  );
}
