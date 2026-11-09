import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, BookOpenCheck, Clock, Pencil, Plus, Search, UserMinus, UserPlus, Wallet } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { attendanceStats, branchById, currentBalance, currentGroupPrice, groupStudentIds, lessonMarkedCount, lessonState, sortedStudents, teacherById } from "@/lib/selectors";
import { DIRECTION_LABELS } from "@/lib/types";
import { cn, formatDate, formatDateTime, formatMoney, fullName, gradeLabel, plural, shortName, weekdayShort } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Checkbox, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, PhoneLink, StatusBadge } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { GroupFormDialog } from "./groups-page";

function AddStudentsDialog({ open, onOpenChange, groupId }: { open: boolean; onOpenChange: (o: boolean) => void; groupId: string }) {
  const state = useAppStore();
  const group = state.groups.find((g) => g.id === groupId)!;
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState<string[]>([]);
  React.useEffect(() => { if (open) { setSel([]); setQ(""); } }, [open]);
  const candidates = sortedStudents(state.students.filter((s) => s.status === "active" && !groupStudentIds(state, group.id).includes(s.id)))
    .filter((s) => !q || fullName(s).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.branchId === group.branchId) - Number(a.branchId === group.branchId));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить в группу</DialogTitle>
          <DialogDescription>{group.name} · сначала показаны ученики филиала</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по ФИО…" className="pl-8" autoFocus />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-border/70 scrollbar-thin">
          {candidates.length === 0 && <p className="p-6 text-center text-[12.5px] text-muted-foreground">Никого не найдено</p>}
          {candidates.map((s) => {
            const checked = sel.includes(s.id);
            const sameBranch = s.branchId === group.branchId;
            return (
              <label key={s.id} className={cn("flex cursor-pointer items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-0 transition-colors hover:bg-accent/50", checked && "bg-primary/[0.04]")}>
                <Checkbox checked={checked} onCheckedChange={(v) => setSel((p) => (v ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                <Avatar name={fullName(s)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{fullName(s)}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{gradeLabel(s.grade)} · {branchById(state, s.branchId)?.shortName}</span>
                </span>
                {!sameBranch && <Badge variant="warning">другой филиал</Badge>}
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!sel.length}
            onClick={() => {
              state.addStudentsToGroup(groupId, sel);
              toast.success(`Добавлено: ${sel.length}`, { description: group.name });
              onOpenChange(false);
            }}
          >
            <UserPlus /> Добавить {sel.length ? `(${sel.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GroupDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const state = useAppStore();
  const { role, pushRecent, removeStudentFromGroup } = state;
  const group = state.groups.find((g) => g.id === id);
  const canEdit = can(role, "groups.edit");
  const canFinance = can(role, "finance.view");
  const [edit, setEdit] = React.useState(false);
  const [add, setAdd] = React.useState(false);
  const [remove, setRemove] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (group) pushRecent({ type: "group", id: group.id, label: group.name, href: `/groups/${group.id}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  if (!group) return <EmptyState title="Группа не найдена" action={<Button onClick={() => navigate("/groups")}>К группам</Button>} />;

  const teacher = teacherById(state, group.teacherId);
  const branch = branchById(state, group.branchId);
  const members = sortedStudents(groupStudentIds(state, group.id).map((sid) => state.students.find((s) => s.id === sid)!).filter(Boolean));
  const lessons = state.lessons.filter((l) => l.groupId === group.id).sort((a, b) => b.date.localeCompare(a.date));
  const history = state.membership.filter((m) => m.groupId === group.id).sort((a, b) => b.at.localeCompare(a.at));
  const stats = attendanceStats(state, { groupId: group.id });

  return (
    <div className="flex flex-col gap-5">
      <Link to="/groups" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Группы
      </Link>
      <Card className="overflow-hidden">
        <div className="h-1.5" style={{ background: branch?.color }} />
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight"><span className="mr-2 rounded bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">{group.code}</span>{group.name}</h1>
              <StatusBadge status={group.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span>{branch?.name} · {DIRECTION_LABELS[group.direction]}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {group.schedule}</span>
              <span className="inline-flex items-center gap-1.5"><Wallet className="size-3.5" /> {formatMoney(currentGroupPrice(state, group))} / занятие</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Avatar name={teacher ? fullName(teacher) : "—"} size="md" />
              <div>
                <div className="text-[13px] font-medium">{teacher ? fullName(teacher) : "Преподаватель не назначен"}</div>
                <div className="text-[11.5px] text-muted-foreground">преподаватель</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate(`/journal?group=${group.id}`)}><BookOpenCheck /> Журнал</Button>
            {canEdit && <Button onClick={() => setEdit(true)}><Pencil /> Редактировать</Button>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border/70 px-5 py-4 sm:grid-cols-4">
          {[
            { l: "Учеников", v: members.filter((m) => m.status === "active").length },
            { l: "Занятий проведено", v: lessons.filter((l) => lessonState(state, l) === "held").length },
            { l: "Посещаемость", v: `${stats.rate}%` },
            { l: "Создана", v: formatDate(group.createdAt) },
          ].map((k) => (
            <div key={k.l}>
              <div className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{k.l}</div>
              <div className="text-lg font-semibold tabular">{k.v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Tabs defaultValue="members">
        <TabsList variant="underline" className="w-full">
          <TabsTrigger value="members">Состав <Badge variant="muted" className="ml-1 px-1 py-0">{members.length}</Badge></TabsTrigger>
          <TabsTrigger value="lessons">Занятия <Badge variant="muted" className="ml-1 px-1 py-0">{lessons.length}</Badge></TabsTrigger>
          <TabsTrigger value="history">История состава</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Состав группы</CardTitle>
              {canEdit && <Button size="sm" onClick={() => setAdd(true)}><Plus /> Добавить учеников</Button>}
            </CardHeader>
            <CardContent className="px-0">
              {members.length === 0 ? (
                <EmptyState compact title="В группе пока никого нет" action={canEdit ? <Button onClick={() => setAdd(true)}><UserPlus /> Добавить</Button> : undefined} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Ученик</TableHead>
                      <TableHead>Класс</TableHead>
                      <TableHead>Представитель</TableHead>
                      <TableHead className="text-center">Посещ.</TableHead>
                      {canFinance && <TableHead className="text-right">Остаток</TableHead>}
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((s) => {
                      const st = attendanceStats(state, { groupId: group.id, studentId: s.id });
                      return (
                        <TableRow key={s.id} className={cn("group/row cursor-pointer", s.status === "inactive" && "opacity-60")} onClick={() => can(role, "students.view") && navigate(`/students/${s.id}`)}>
                          <TableCell className="pl-5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={fullName(s)} size="md" />
                              <div>
                                <div className="font-medium">{fullName(s)}</div>
                                <div className="text-[11.5px] text-muted-foreground">{s.birthYear} г.р. {s.status === "inactive" && "· неактивный"}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="tabular">{s.grade}</TableCell>
                          <TableCell>
                            <div className="text-[12.5px]">{s.parentName}</div>
                            <PhoneLink phone={s.parentPhone} className="text-[12px]" />
                          </TableCell>
                          <TableCell className="text-center tabular">{st.total ? `${st.rate}%` : "—"}</TableCell>
                          {canFinance && <TableCell className="text-right"><Money value={currentBalance(state, s.id)} colored /></TableCell>}
                          <TableCell>
                            {canEdit && (
                              <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover/row:opacity-100" onClick={(e) => { e.stopPropagation(); setRemove(s.id); }} aria-label="Исключить">
                                <UserMinus className="text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lessons">
          <Card>
            <CardHeader><CardTitle>Занятия</CardTitle></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Дата</TableHead>
                    <TableHead>Преподаватель</TableHead>
                    <TableHead className="text-center">Присутствовало</TableHead>
                    <TableHead className="text-right pr-5">Журнал</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lessons.slice(0, 60).map((l) => {
                    const m = lessonMarkedCount(state, l);
                    const sub = l.substituteTeacherId ? teacherById(state, l.substituteTeacherId) : null;
                    return (
                      <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/journal?group=${group.id}&month=${l.date.slice(0, 7)}`)}>
                        <TableCell className="pl-5 font-medium tabular">{formatDate(l.date)} <span className="text-muted-foreground">{weekdayShort(l.date)}</span></TableCell>
                        <TableCell>
                          {sub ? <span className="inline-flex items-center gap-1.5">{shortName(sub)} <Badge variant="warning">замена</Badge></span> : teacher ? shortName(teacher) : "—"}
                        </TableCell>
                        <TableCell className="text-center tabular">{l.cancelled ? <Badge variant="muted">не состоялось</Badge> : m.marked ? `${m.present} / ${m.total}` : l.date > state.settings.today ? <Badge variant="muted">запланировано</Badge> : <Badge variant="warning">не отмечено</Badge>}</TableCell>
                        <TableCell className="text-right pr-5"><Button variant="ghost" size="xs"><BookOpenCheck /> Открыть</Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>История изменений состава</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative flex flex-col gap-3 border-l border-border/70 pl-4">
                {history.map((h) => {
                  const s = state.students.find((x) => x.id === h.studentId);
                  return (
                    <li key={h.id} className="relative">
                      <span className={cn("absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-background", h.type === "added" ? "bg-success" : "bg-destructive")} />
                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <Badge variant={h.type === "added" ? "success" : "destructive"}>{h.type === "added" ? "добавлен" : "исключён"}</Badge>
                        <span className="font-medium">{s ? fullName(s) : h.studentId}</span>
                      </div>
                      <p className="text-[11.5px] text-muted-foreground">{h.at.length > 10 ? formatDateTime(h.at) : formatDate(h.at)} · {h.by}</p>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-[12px] text-muted-foreground">{plural(history.length, "запись", "записи", "записей")}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <GroupFormDialog open={edit} onOpenChange={setEdit} group={group} />
      <AddStudentsDialog open={add} onOpenChange={setAdd} groupId={group.id} />
      <ConfirmDialog
        open={!!remove}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Исключить из группы?"
        description="История посещаемости сохранится. Ученика можно будет вернуть в группу позже."
        confirmLabel="Исключить"
        destructive
        onConfirm={() => {
          if (remove) removeStudentFromGroup(group.id, remove);
          setRemove(null);
          toast.success("Ученик исключён из группы");
        }}
      />
    </div>
  );
}
