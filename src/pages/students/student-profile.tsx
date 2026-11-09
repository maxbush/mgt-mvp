import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, BookOpenCheck, FilePlus2, FileSignature, Pencil, Plus, Trash2, UserX, UserCheck, Wallet, CheckCircle2, AlertCircle, ExternalLink,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import {
  ATTENDANCE_META, attendanceStats, attKey, balanceHistory, branchById, contractConflict, currentBalance, currentGroupPrice, currentYear, monthsOfYear, studentById, studentContracts,
  studentGroups, teacherById,
} from "@/lib/selectors";
import { ADDENDUM_TEMPLATES } from "@/lib/mock-data";
import { cn, formatDate, formatDateTime, formatMoney, fullName, gradeLabel, monthLabel, shortName, weekdayShort } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger, SimpleSelect } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DL, Money, PhoneButton, PhoneLink, StatusBadge } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentDialog, PAYMENT_METHODS } from "@/components/shared/payment-dialog";
import { StudentFormSheet } from "./student-form";
import { EnrollmentsCard, LedgerCard } from "./student-extras";
import { ContractHistory } from "./students-page";

function NewContractDialog({ open, onOpenChange, studentId }: { open: boolean; onOpenChange: (o: boolean) => void; studentId: string }) {
  const state = useAppStore();
  const student = studentById(state, studentId)!;
  const [number, setNumber] = React.useState("");
  const [yearId, setYearId] = React.useState(currentYear(state).id);
  const [date, setDate] = React.useState(state.settings.today);
  const conflict = number ? contractConflict(state, number, yearId) : null;
  const taken = !!conflict;
  const hasActive = state.contracts.some((c) => c.studentId === studentId && c.academicYearId === yearId && c.status === "active");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Новый договор</DialogTitle>
          <DialogDescription>{fullName(student)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Учебный год">
            <SimpleSelect value={yearId} onValueChange={setYearId} options={state.academicYears.map((y) => ({ value: y.id, label: y.label }))} />
          </Field>
          <Field label="№ договора" error={conflict?.message}>
            <div className="relative">
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="01э, 12р, 09-191б" className="pr-8 font-mono" autoFocus />
              {number && <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{taken ? <AlertCircle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-success" />}</span>}
            </div>
          </Field>
          <Field label="Дата">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {hasActive && <p className="rounded-md bg-warning/15 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">В этом учебном году уже есть активный договор. Сначала закройте его, чтобы избежать дублей.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!number || taken || hasActive}
            onClick={() => {
              state.upsertStudent(student, { number, academicYearId: yearId, date });
              toast.success(`Договор ${number} создан`);
              onOpenChange(false);
            }}
          >
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StudentProfilePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const state = useAppStore();
  const { role, pushRecent, setStudentsStatus, closeContract, deletePayment } = state;
  const student = studentById(state, id);
  const canEdit = can(role, "students.edit");
  const canFinance = can(role, "finance.view");
  const [edit, setEdit] = React.useState(false);
  const [pay, setPay] = React.useState(false);
  const [newContract, setNewContract] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ kind: "status" | "contract" | "payment"; id?: string; mode?: "closed" | "terminated" } | null>(null);

  React.useEffect(() => {
    if (student) pushRecent({ type: "student", id: student.id, label: fullName(student), href: `/students/${student.id}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id]);

  if (!student) {
    return <EmptyState title="Ученик не найден" description="Возможно, карточка была удалена." action={<Button onClick={() => navigate("/students")}>К реестру</Button>} />;
  }

  const branch = branchById(state, student.branchId);
  const groups = studentGroups(state, student.id);
  const contracts = studentContracts(state, student.id);
  const balance = currentBalance(state, student.id);
  const history = balanceHistory(state, student.id);
  const payments = state.payments
    .filter((p) => p.status === "confirmed" && (p.studentId === student.id || p.splits?.some((x) => x.studentId === student.id)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const attAll = attendanceStats(state, { studentId: student.id });
  const addendums = state.addendums.filter((a) => a.studentId === student.id);
  const audit = state.audit.filter((a) => a.entityId === student.id || a.entityId.split(",").includes(student.id) || a.description.includes(student.lastName));
  const lessons = state.lessons
    .filter((l) => groups.some((g) => g.id === l.groupId) && l.date <= state.settings.today && !l.cancelled)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 24);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/students" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Реестр учеников
        </Link>
      </div>

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={fullName(student)} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{fullName(student)}</h1>
                <StatusBadge status={student.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: branch?.color }} />
                  {branch?.name}
                </span>
                <span>{gradeLabel(student.grade)}</span>
                {student.birthYear > 0 && <span>{student.birthYear} г.р.</span>}
                {contracts[0] && <span className="font-mono">{contracts[0].number}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <Badge key={g.id} variant="violet" className="cursor-pointer" onClick={() => navigate(`/groups/${g.id}`)}>
                    {g.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PhoneButton phone={student.parentPhone} />
            {can(role, "finance.edit") && (
              <Button variant="outline" onClick={() => setPay(true)}>
                <Wallet /> Оплата
              </Button>
            )}
            {can(role, "documents.edit") && (
              <Button variant="outline" onClick={() => navigate(`/addendums?student=${student.id}`)}>
                <FileSignature /> Доп. соглашение
              </Button>
            )}
            {canEdit && (
              <>
                <Button onClick={() => setEdit(true)}>
                  <Pencil /> Редактировать
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setConfirm({ kind: "status" })} aria-label="Сменить статус">
                  {student.status === "active" ? <UserX /> : <UserCheck />}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* mini KPIs */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/70 pt-4 sm:grid-cols-4">
          {canFinance && (
            <div>
              <div className="text-[11.5px] uppercase tracking-wide text-muted-foreground">Остаток</div>
              <div className={cn("text-lg font-semibold tabular", balance < 0 && "text-destructive")}>{formatMoney(balance)}</div>
            </div>
          )}
          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-muted-foreground">Посещаемость</div>
            <div className="text-lg font-semibold tabular">{attAll.rate}%</div>
          </div>
          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-muted-foreground">Занятий</div>
            <div className="text-lg font-semibold tabular">{attAll.total}</div>
          </div>
          <div>
            <div className="text-[11.5px] uppercase tracking-wide text-muted-foreground">В школе с</div>
            <div className="text-lg font-semibold tabular">{formatDate(student.createdAt)}</div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue={params.get("tab") && (params.get("tab") !== "finance" || canFinance) ? params.get("tab")! : "overview"}>
        <TabsList variant="underline" className="w-full overflow-x-auto no-scrollbar">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="contracts">Договоры <Badge variant="muted" className="ml-1 px-1 py-0">{contracts.length}</Badge></TabsTrigger>
          <TabsTrigger value="attendance">Посещаемость</TabsTrigger>
          {canFinance && <TabsTrigger value="finance">Финансы</TabsTrigger>}
          <TabsTrigger value="docs">Документы</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>

        {/* Обзор */}
        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Основные данные</CardTitle></CardHeader>
            <CardContent>
              <DL
                cols={2}
                items={[
                  { label: "ФИО", value: fullName(student) },
                  { label: "Год рождения", value: student.birthYear > 0 ? student.birthYear : "не указан" },
                  { label: "Класс", value: gradeLabel(student.grade) },
                  { label: "Филиал", value: branch?.name },
                  { label: "Законный представитель", value: student.parentName },
                  { label: "Телефон", value: <PhoneLink phone={student.parentPhone} /> },
                  { label: "Доп. телефон", value: student.parentPhone2 ? <PhoneLink phone={student.parentPhone2} /> : "" },
                  { label: "Текущий договор", value: contracts.find((c) => c.status === "active") ? <span className="font-mono">{contracts.find((c) => c.status === "active")!.number}</span> : "" },
                  { label: "Примечания", value: student.notes },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Группы</CardTitle>
              {canEdit && <Button variant="ghost" size="xs" onClick={() => setEdit(true)}><Plus /> Изменить</Button>}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {groups.length === 0 && <p className="text-[12.5px] text-muted-foreground">Ученик не состоит в группах</p>}
              {groups.map((g) => {
                const t = teacherById(state, g.teacherId);
                return (
                  <button key={g.id} onClick={() => navigate(`/groups/${g.id}`)} className="rounded-lg border border-border/70 p-3 text-left transition-colors hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium"><span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{g.code}</span>{g.name}</span>
                      <span className="text-[12px] tabular text-muted-foreground">{formatMoney(currentGroupPrice(state, g))}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">{g.schedule}</div>
                    <div className="text-[12px] text-muted-foreground">{t ? shortName(t) : ""}</div>
                  </button>
                );
              })}
              {groups[0] && (
                <Button variant="outline" size="sm" className="mt-1" onClick={() => navigate(`/journal?group=${groups[0].id}`)}>
                  <BookOpenCheck /> Открыть журнал
                </Button>
              )}
            </CardContent>
          </Card>
          <EnrollmentsCard studentId={student.id} canEdit={canEdit} />
        </TabsContent>

        {/* Договоры */}
        <TabsContent value="contracts">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Договоры по учебным годам</CardTitle>
              {canEdit && <Button size="sm" onClick={() => setNewContract(true)}><FilePlus2 /> Новый договор</Button>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ContractHistory studentId={student.id} />
              {canEdit && contracts.some((c) => c.status === "active") && (
                <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
                  {contracts.filter((c) => c.status === "active").map((c) => (
                    <React.Fragment key={c.id}>
                      <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: "contract", id: c.id, mode: "closed" })}>Завершить {c.number}</Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirm({ kind: "contract", id: c.id, mode: "terminated" })}>Расторгнуть {c.number}</Button>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Посещаемость */}
        <TabsContent value="attendance" className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>По месяцам</CardTitle></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Месяц</TableHead>
                    {(["present", "absent", "sick", "excused"] as const).map((k) => (
                      <TableHead key={k} className="text-center">
                        <span className={cn("inline-flex size-5 items-center justify-center rounded border text-[10.5px] font-semibold", ATTENDANCE_META[k].className)}>{ATTENDANCE_META[k].short}</span>
                      </TableHead>
                    ))}
                    <TableHead className="pr-5 text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthsOfYear(state).map((m) => {
                    const st = attendanceStats(state, { month: m, studentId: student.id });
                    return (
                      <TableRow key={m}>
                        <TableCell className="pl-5 font-medium capitalize">{monthLabel(m)}</TableCell>
                        <TableCell className="text-center tabular">{st.present}</TableCell>
                        <TableCell className="text-center tabular">{st.absent}</TableCell>
                        <TableCell className="text-center tabular">{st.sick}</TableCell>
                        <TableCell className="text-center tabular">{st.excused}</TableCell>
                        <TableCell className="pr-5 text-right tabular font-medium">{st.total ? `${st.rate}%` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="pl-5">Итого</TableCell>
                    <TableCell className="text-center tabular">{attAll.present}</TableCell>
                    <TableCell className="text-center tabular">{attAll.absent}</TableCell>
                    <TableCell className="text-center tabular">{attAll.sick}</TableCell>
                    <TableCell className="text-center tabular">{attAll.excused}</TableCell>
                    <TableCell className="pr-5 text-right tabular">{attAll.rate}%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Последние занятия</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {lessons.map((l) => {
                const st = state.attendance[attKey(l.id, student.id)];
                const g = state.groups.find((x) => x.id === l.groupId);
                return (
                  <div
                    key={l.id}
                    title={`${formatDate(l.date)} · ${g?.name} · ${st ? ATTENDANCE_META[st].label : "не отмечено"}`}
                    className={cn("flex h-11 w-[52px] flex-col items-center justify-center rounded-md border text-center leading-none", st ? ATTENDANCE_META[st].className : "border-dashed border-border text-muted-foreground")}
                  >
                    <span className="text-[12px] font-semibold tabular">{l.date.slice(8)}.{l.date.slice(5, 7)}</span>
                    <span className="mt-0.5 text-[9.5px] uppercase opacity-80">{st ? ATTENDANCE_META[st].short : weekdayShort(l.date)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Финансы */}
        {canFinance && (
          <TabsContent value="finance" className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle>История остатков</CardTitle></CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Месяц</TableHead>
                      <TableHead className="text-right">Нач.</TableHead>
                      <TableHead className="text-right">Сдано</TableHead>
                      <TableHead className="text-right">Израсх.</TableHead>
                      <TableHead className="pr-5 text-right">Кон.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((r) => (
                      <TableRow key={r.month}>
                        <TableCell className="pl-5 font-medium capitalize">{r.label}</TableCell>
                        <TableCell className="text-right"><Money value={r.opening} colored /></TableCell>
                        <TableCell className="text-right text-success"><Money value={r.paid} /></TableCell>
                        <TableCell className="text-right">
                          <Money value={r.consumed} /> <span className="text-[11px] text-muted-foreground">({r.consumedCount})</span>
                        </TableCell>
                        <TableCell className="pr-5 text-right font-medium"><Money value={r.closing} colored /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Оплаты</CardTitle>
                {can(role, "finance.edit") && <Button size="sm" onClick={() => setPay(true)}><Plus /> Внести</Button>}
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border/60">
                {payments.length === 0 && <p className="py-4 text-center text-[12.5px] text-muted-foreground">Оплат пока нет</p>}
                {payments.map((p) => (
                  <div key={p.id} className="group flex items-center gap-3 py-2">
                    <div className="flex size-8 items-center justify-center rounded-md bg-success/10 text-success"><Wallet className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium tabular">{formatMoney(p.splits ? (p.splits.find((x) => x.studentId === student.id)?.amount ?? 0) : p.amount)}{p.splits && <span className="ml-1 text-[11px] font-normal text-muted-foreground">часть платежа {formatMoney(p.amount, false)}</span>}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">
                        {formatDate(p.date)} · {PAYMENT_METHODS.find((m) => m.value === p.method)?.label} · {p.createdBy}
                        {p.comment && ` · ${p.comment}`}
                      </div>
                    </div>
                    {can(role, "finance.edit") && (
                      <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" onClick={() => setConfirm({ kind: "payment", id: p.id })}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            <LedgerCard studentId={student.id} canEdit={can(role, "finance.edit")} />
          </TabsContent>
        )}

        {/* Документы */}
        <TabsContent value="docs">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Документы</CardTitle>
              {can(role, "documents.edit") && <Button size="sm" onClick={() => navigate(`/addendums?student=${student.id}`)}><FileSignature /> Доп. соглашение</Button>}
            </CardHeader>
            <CardContent>
              {addendums.length === 0 && contracts.length === 0 ? (
                <EmptyState compact title="Документов нет" description="Договоры и дополнительные соглашения появятся здесь." />
              ) : (
                <div className="flex flex-col divide-y divide-border/60">
                  {contracts.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 py-2.5">
                      <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary"><FilePlus2 className="size-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium">Договор {c.number}</div>
                        <div className="text-[11.5px] text-muted-foreground">от {formatDate(c.date)} · {state.academicYears.find((y) => y.id === c.academicYearId)?.label}</div>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                  {addendums.map((a) => {
                    const c = state.contracts.find((x) => x.id === a.contractId);
                    const tpl = ADDENDUM_TEMPLATES.find((t) => t.id === a.templateId);
                    return (
                      <div key={a.id} className="flex items-center gap-3 py-2.5">
                        <div className="flex size-8 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300"><FileSignature className="size-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium">Доп. соглашение №{a.number} к договору {c?.number}</div>
                          <div className="truncate text-[11.5px] text-muted-foreground">{formatDate(a.date)} · {tpl?.title} · п. {a.clause}</div>
                        </div>
                        <Button variant="ghost" size="xs" onClick={() => navigate(`/addendums?open=${a.id}`)}><ExternalLink /> Открыть</Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* История */}
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>История изменений</CardTitle></CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">Изменений пока не зафиксировано.</p>
              ) : (
                <ol className="relative flex flex-col gap-3 border-l border-border/70 pl-4">
                  {audit.map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-background bg-primary/70" />
                      <p className="text-[13px]">{a.description}</p>
                      <p className="text-[11.5px] text-muted-foreground">{a.userName} · {formatDateTime(a.at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StudentFormSheet open={edit} onOpenChange={setEdit} student={student} />
      <PaymentDialog open={pay} onOpenChange={setPay} studentId={student.id} lockStudent />
      <NewContractDialog open={newContract} onOpenChange={setNewContract} studentId={student.id} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "status" ? (student.status === "active" ? "Деактивировать ученика?" : "Активировать ученика?") : confirm?.kind === "contract" ? (confirm.mode === "terminated" ? "Расторгнуть договор?" : "Завершить договор?") : "Удалить оплату?"}
        description={confirm?.kind === "status" ? "Статус можно будет изменить обратно в любой момент." : confirm?.kind === "contract" ? "Договор перейдёт в архив, история сохранится." : "Сумма будет исключена из ведомости и остатка."}
        confirmLabel={confirm?.kind === "status" ? (student.status === "active" ? "Деактивировать" : "Активировать") : confirm?.kind === "contract" ? (confirm.mode === "terminated" ? "Расторгнуть" : "Завершить") : "Удалить"}
        destructive={!(confirm?.kind === "status" && student.status === "inactive")}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "status") setStudentsStatus([student.id], student.status === "active" ? "inactive" : "active");
          if (confirm.kind === "contract" && confirm.id) closeContract(confirm.id, confirm.mode ?? "closed");
          if (confirm.kind === "payment" && confirm.id) deletePayment(confirm.id);
          toast.success("Готово");
          setConfirm(null);
        }}
      />
    </div>
  );
}
