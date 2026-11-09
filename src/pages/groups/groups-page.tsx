import * as React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, BookOpenCheck, Clock, Plus, Search, Users } from "lucide-react";
import type { Direction, Group } from "@/lib/types";
import { DIRECTION_LABELS } from "@/lib/types";
import { useAppStore, useCurMonth, useScopedGroupIds, useToday } from "@/lib/store";
import { can } from "@/lib/rbac";
import { WEEKDAY_SHORT } from "@/lib/mock-data";
import { attendanceStats, currentGroupPrice, currentYear, groupStudentIds, teacherById, branchById } from "@/lib/selectors";
import { cn, formatDate, formatMoney, fullName, shortName, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/form-controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import { PageHeader, PageSkeleton, useFakeLoading } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";

/* ---------- Форма группы (создание / редактирование) ---------- */
export function GroupFormDialog({ open, onOpenChange, group }: { open: boolean; onOpenChange: (o: boolean) => void; group?: Group }) {
  const state = useAppStore();
  const upsertGroup = useAppStore((s) => s.upsertGroup);
  const today = useToday();
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [direction, setDirection] = React.useState<Direction>("electronics");
  const [branchId, setBranchId] = React.useState("");
  const [teacherId, setTeacherId] = React.useState("");
  const [yearId, setYearId] = React.useState("");
  const [price, setPrice] = React.useState("30");
  const [priceFrom, setPriceFrom] = React.useState(today);
  const [weekdays, setWeekdays] = React.useState<number[]>([1, 3]);
  const [time, setTime] = React.useState("16:00");

  React.useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setCode(group?.code ?? "");
    setDirection(group?.direction ?? "electronics");
    setBranchId(group?.branchId ?? state.branches[0]?.id ?? "");
    setTeacherId(group?.teacherId ?? state.teachers.find((t) => t.status === "active")?.id ?? "");
    setYearId(group?.academicYearId ?? currentYear(state).id);
    setPrice(group ? String(currentGroupPrice(state, group)) : "30");
    setPriceFrom(today);
    setWeekdays(group?.weekdays ?? [1, 3]);
    setTime(group?.schedule.split("·")[1]?.trim() ?? "16:00");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.id]);

  const priceNum = Number(price.replace(",", "."));
  const priceChanged = !!group && Math.round(priceNum * 100) !== Math.round(currentGroupPrice(state, group) * 100);
  const valid = name.trim().length >= 3 && code.trim().length > 0 && branchId && teacherId && priceNum > 0 && weekdays.length > 0 && (!priceChanged || !!priceFrom);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Редактировать группу" : "Новая группа"}</DialogTitle>
          <DialogDescription>Цена занятия действует с даты: прошлые занятия считаются по прежней цене.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Field label="Название (для печатных форм)" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Робототехника №1 группа" autoFocus />
            </Field>
            <Field label="Код" required>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="р1" />
            </Field>
          </div>
          <Field label="Направление" required>
            <SimpleSelect value={direction} onValueChange={(v) => setDirection(v as Direction)} options={(Object.keys(DIRECTION_LABELS) as Direction[]).map((d) => ({ value: d, label: DIRECTION_LABELS[d] }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Филиал" required>
              <SimpleSelect value={branchId} onValueChange={setBranchId} options={state.branches.map((b) => ({ value: b.id, label: b.name }))} />
            </Field>
            <Field label="Преподаватель" required>
              <SimpleSelect value={teacherId} onValueChange={setTeacherId} options={state.teachers.filter((t) => t.status === "active").map((t) => ({ value: t.id, label: fullName(t) }))} />
            </Field>
            <Field label="Учебный год">
              <SimpleSelect value={yearId} onValueChange={setYearId} options={state.academicYears.map((y) => ({ value: y.id, label: y.label }))} />
            </Field>
            <Field label="Цена занятия, BYN" required>
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="tabular text-right" />
            </Field>
            {(priceChanged || !group) && (
              <Field label={group ? "Новая цена действует с" : "Цена действует с"} required>
                <Input type="date" value={group ? priceFrom : currentYear(state).startDate} disabled={!group} onChange={(e) => setPriceFrom(e.target.value)} />
              </Field>
            )}
          </div>
          {group && group.prices.length > 1 && (
            <p className="rounded-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
              История цен: {[...group.prices].sort((a, b) => (a.from < b.from ? -1 : 1)).map((p) => `${formatMoney(p.price, false)} с ${formatDate(p.from)}`).join(" → ")}
            </p>
          )}
          <Field label="Дни недели" required>
            <div className="flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort((a, b) => (a || 7) - (b || 7))))}
                  className={cn("h-8 w-10 rounded-md border text-[12.5px] font-medium transition-colors", weekdays.includes(d) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}
                >
                  {WEEKDAY_SHORT[d]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Время">
            <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="15:00–16:30" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              const p = Math.round(priceNum * 100) / 100;
              const prices = group ? (priceChanged ? [...group.prices.filter((x) => x.from !== priceFrom), { from: priceFrom, price: p }] : group.prices) : [{ from: currentYear(state).startDate, price: p }];
              const g: Group = {
                id: group?.id ?? uid("g"),
                name: name.trim(),
                code: code.trim(),
                direction,
                branchId,
                teacherId,
                academicYearId: yearId,
                prices,
                weekdays,
                schedule: `${weekdays.map((w) => WEEKDAY_SHORT[w]).join(", ")} · ${time}`,
                status: group?.status ?? "active",
                createdAt: group?.createdAt ?? new Date().toISOString().slice(0, 10),
              };
              upsertGroup(g);
              toast.success(group ? "Группа обновлена" : "Группа создана", { description: g.name });
              onOpenChange(false);
            }}
          >
            {group ? "Сохранить" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Карточка группы ---------- */
function GroupCard({ group, index }: { group: Group; index: number }) {
  const navigate = useNavigate();
  const state = useAppStore();
  const teacher = teacherById(state, group.teacherId);
  const branch = branchById(state, group.branchId);
  const month = useCurMonth();
  const stats = attendanceStats(state, { month, groupId: group.id });
  const lessons = state.lessons.filter((l) => l.groupId === group.id && l.date.startsWith(month) && !l.cancelled).length;
  const activeCount = groupStudentIds(state, group.id).filter((id) => state.students.find((s) => s.id === id)?.status === "active").length;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, duration: 0.25 }} whileHover={{ y: -2 }}>
      <div
        role="link"
        onClick={() => navigate(`/groups/${group.id}`)}
        className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-card transition-shadow hover:shadow-float"
      >
        <div className="h-1 w-full" style={{ background: branch?.color }} />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[14px] font-semibold tracking-tight"><span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{group.code}</span>{group.name}</h3>
              <p className="text-[12px] text-muted-foreground">{branch?.name} · {DIRECTION_LABELS[group.direction]}</p>
            </div>
            {group.status === "inactive" && <Badge variant="muted">архив</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Avatar name={teacher ? fullName(teacher) : "—"} size="sm" />
            <span className="truncate text-[12.5px]">{teacher ? shortName(teacher) : "Не назначен"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Clock className="size-3.5" /> {group.schedule}
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
            <div>
              <div className="text-[15px] font-semibold tabular">{activeCount}</div>
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">учеников</div>
            </div>
            <div>
              <div className={cn("text-[15px] font-semibold tabular", stats.rate >= 80 ? "text-success" : stats.total ? "text-amber-600" : "")}>{stats.total ? `${stats.rate}%` : "—"}</div>
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">посещ.</div>
            </div>
            <div>
              <div className="text-[15px] font-semibold tabular">{formatMoney(currentGroupPrice(state, group), false)}</div>
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Br / занятие</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); navigate(`/journal?group=${group.id}`); }}>
              <BookOpenCheck /> Журнал {lessons ? <span className="text-muted-foreground">· {lessons}</span> : null}
            </Button>
            <Button variant="ghost" size="sm" className="px-2" onClick={(e) => { e.stopPropagation(); navigate(`/groups/${group.id}`); }}>
              <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function GroupsPage() {
  const state = useAppStore();
  const scope = useScopedGroupIds();
  const role = state.role;
  const loading = useFakeLoading(250);
  const [branch, setBranch] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const canEdit = can(role, "groups.edit");

  const groups = state.groups
    .filter((g) => !scope || scope.includes(g.id))
    .filter((g) => branch === "all" || g.branchId === branch)
    .filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()) || (teacherById(state, g.teacherId) && fullName(teacherById(state, g.teacherId)!).toLowerCase().includes(q.toLowerCase())));

  if (loading) return <PageSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={role === "teacher" ? "Мои группы" : "Группы"}
        description={`${groups.length} групп · ${groups.reduce((a, g) => a + groupStudentIds(state, g.id).length, 0)} учеников`}
        actions={canEdit ? <Button onClick={() => setFormOpen(true)}><Plus /> Новая группа</Button> : undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или преподаватель…" className="h-8 pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setBranch("all")} className={cn("h-8 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors", branch === "all" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>
            Все филиалы
          </button>
          {state.branches.map((b) => (
            <button key={b.id} onClick={() => setBranch(b.id)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors", branch === b.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>
              <span className="size-2 rounded-full" style={{ background: b.color }} /> {b.shortName}
            </button>
          ))}
        </div>
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={<Users />} title="Групп не найдено" description="Измените фильтры или создайте новую группу." action={canEdit ? <Button onClick={() => setFormOpen(true)}><Plus /> Новая группа</Button> : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {groups.map((g, i) => (
            <GroupCard key={g.id} group={g} index={i} />
          ))}
        </div>
      )}
      <GroupFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
