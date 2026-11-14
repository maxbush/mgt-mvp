import * as React from "react";
import { toast } from "sonner";
import { ArrowRightLeft, LogOut, Plus, Trash2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { branchById, groupById, isMonthClosed, ledger, monthsOfYear, studentById, studentEnrollments } from "@/lib/selectors";
import { parseMoney } from "@/lib/bepaid";
import { cn, formatDate, monthLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/form-controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/shared/bits";

/* ---------- Зачисления и история групп ---------- */
type EnrollDialog = { kind: "enroll" } | { kind: "move"; groupId: string } | { kind: "out"; groupId: string } | null;

export function EnrollmentsCard({ studentId, canEdit }: { studentId: string; canEdit: boolean }) {
  const state = useAppStore();
  const student = studentById(state, studentId)!;
  const [dlg, setDlg] = React.useState<EnrollDialog>(null);
  const [groupId, setGroupId] = React.useState("");
  const [date, setDate] = React.useState(state.settings.today);
  const list = studentEnrollments(state, studentId);

  const open = (d: EnrollDialog) => {
    setDlg(d);
    setDate(state.settings.today);
    const others = state.groups.filter((g) => g.status === "active" && !(d && d.kind === "move" && g.id === d.groupId));
    setGroupId(others[0]?.id ?? "");
  };
  const options = state.groups
    .filter((g) => g.status === "active" && !(dlg && dlg.kind === "move" && g.id === dlg.groupId))
    .map((g) => ({ value: g.id, label: `${g.code} · ${branchById(state, g.branchId)?.shortName}` }));

  const submit = async () => {
    if (!dlg) return;
    if (dlg.kind === "enroll") {
      if (state.enrollments.some((e) => e.studentId === studentId && e.groupId === groupId && !e.to)) return toast.error("Ученик уже зачислен в эту группу");
      state.addStudentsToGroup(groupId, [studentId], date);
      toast.success("Ученик зачислен", { description: `${groupById(state, groupId)?.name} · с ${formatDate(date)}` });
    } else if (dlg.kind === "move") {
      const r = await state.transferStudent(studentId, dlg.groupId, groupId, date);
      if (!r.ok) return toast.error("Перевод не выполнен", { description: r.reason });
      toast.success("Перевод выполнен", { description: "Старая запись закрыта днём раньше, история посещаемости сохранена" });
    } else {
      const last = new Date(`${date}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() - 1);
      state.removeStudentFromGroup(dlg.groupId, studentId, last.toISOString().slice(0, 10));
      toast.success("Зачисление закрыто", { description: `Последний день — ${formatDate(last.toISOString().slice(0, 10))}` });
    }
    setDlg(null);
  };

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Зачисления и история групп</CardTitle>
        {canEdit && student.status === "active" && <Button size="sm" variant="outline" onClick={() => open({ kind: "enroll" })}><Plus /> Зачислить в группу</Button>}
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Группа</TableHead>
              <TableHead>Филиал</TableHead>
              <TableHead>С</TableHead>
              <TableHead>По</TableHead>
              <TableHead className="pr-5 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((e) => {
              const g = groupById(state, e.groupId);
              return (
                <TableRow key={e.id}>
                  <TableCell className="pl-5"><span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{g?.code}</span>{g?.name}</TableCell>
                  <TableCell>{g && branchById(state, g.branchId)?.name}</TableCell>
                  <TableCell className="tabular">{formatDate(e.from)}</TableCell>
                  <TableCell className="tabular">{e.to ? formatDate(e.to) : <Badge variant="success">действует</Badge>}</TableCell>
                  <TableCell className="pr-5">
                    {canEdit && !e.to && student.status === "active" && (
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="outline" onClick={() => open({ kind: "move", groupId: e.groupId })}><ArrowRightLeft /> Перевести</Button>
                        <Button size="xs" variant="outline" className="text-destructive" onClick={() => open({ kind: "out", groupId: e.groupId })}><LogOut /> Исключить</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {list.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Зачислений нет</TableCell></TableRow>}
          </TableBody>
        </Table>
        <p className="px-5 pt-3 text-[12px] text-muted-foreground">
          Перевод — это закрытие одной записи и открытие другой. В журнале группы ученик виден только на датах своего зачисления; история посещаемости и остаток сохраняются.
        </p>
      </CardContent>

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{dlg?.kind === "enroll" ? "Зачислить в группу" : dlg?.kind === "move" ? "Перевести в другую группу" : "Исключить из группы"}</DialogTitle>
            <DialogDescription>
              {dlg?.kind === "move" && `Сейчас: ${groupById(state, dlg.groupId)?.code}. В старой группе ученик числится по предыдущий день, в новой — с выбранной даты.`}
              {dlg?.kind === "out" && `Группа: ${groupById(state, dlg.groupId)?.code}. Последним днём зачисления станет предыдущий день. История посещаемости останется.`}
              {dlg?.kind === "enroll" && "Ученик может состоять в нескольких группах одновременно."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {dlg?.kind !== "out" && (
              <Field label={dlg?.kind === "move" ? "Новая группа" : "Группа"}>
                <SimpleSelect value={groupId} onValueChange={setGroupId} options={options} />
              </Field>
            )}
            <Field label={dlg?.kind === "enroll" ? "Зачислен с" : dlg?.kind === "move" ? "Перевод с даты" : "Исключить с даты"}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Отмена</Button>
            <Button variant={dlg?.kind === "out" ? "destructive" : "default"} onClick={submit} disabled={!date || (dlg?.kind !== "out" && !groupId)}>
              {dlg?.kind === "enroll" ? "Зачислить" : dlg?.kind === "move" ? "Перевести" : "Исключить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- Журнал проводок и ручная корректировка ---------- */
export function LedgerCard({ studentId, canEdit }: { studentId: string; canEdit: boolean }) {
  const state = useAppStore();
  const [month, setMonth] = React.useState("all");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(state.settings.today);
  const [comment, setComment] = React.useState("");
  const [err, setErr] = React.useState("");
  const months = monthsOfYear(state);
  let run = 0;
  const all = ledger(state, studentId).map((e) => ({ ...e, run: (run += e.amount) }));
  const rows = (month === "all" ? all : all.filter((e) => e.date.startsWith(month))).slice().reverse();
  const TYPE = { open: ["начальный", "bg-muted text-muted-foreground"], pay: ["платёж", "bg-success/15 text-success"], adj: ["коррект.", "bg-warning/20 text-amber-700 dark:text-amber-300"], charge: ["списание", "bg-info/15 text-info"] } as const;

  const add = async () => {
    const a = parseMoney(amount);
    if (Number.isNaN(a)) return setErr("Введите сумму числом, например −15,00 или 30,00.");
    const r = await state.addAdjustment({ studentId, date, amount: a, comment });
    if (!r.ok) return setErr(r.reason);
    setErr("");
    setAmount("");
    setComment("");
    toast.success("Корректировка добавлена");
  };

  return (
    <Card className="lg:col-span-5">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Журнал проводок</CardTitle>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Остаток не хранится: он вычисляется из начального остатка, платежей, корректировок и списаний за посещённые занятия.</p>
        </div>
        <SimpleSelect value={month} onValueChange={setMonth} options={[{ value: "all", label: "Все месяцы" }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))]} className="w-44" />
      </CardHeader>
      <CardContent className="px-0">
        <div className="max-h-[420px] overflow-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Дата</TableHead>
                <TableHead>Операция</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                <TableHead className="text-right">Остаток после</TableHead>
                <TableHead className="w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e, i) => (
                <TableRow key={`${e.ref ?? e.type}-${i}`}>
                  <TableCell className="pl-5 tabular">{formatDate(e.date)}</TableCell>
                  <TableCell>
                    <span className={cn("mr-2 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", TYPE[e.type][1])}>{TYPE[e.type][0]}</span>
                    {e.label}
                  </TableCell>
                  <TableCell className="text-right"><Money value={e.amount / 100} colored /></TableCell>
                  <TableCell className="text-right"><Money value={e.run / 100} colored /></TableCell>
                  <TableCell className="pr-4">
                    {e.type === "adj" && canEdit && (
                      <Button variant="ghost" size="icon-xs" aria-label="Удалить корректировку" onClick={async () => { const r = await state.removeAdjustment(e.ref!); if (!r.ok) toast.error("Нельзя удалить", { description: r.reason }); else toast.success("Корректировка удалена"); }}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Проводок нет</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {canEdit && (
          <div className="mx-5 mt-4 rounded-lg border border-dashed border-border p-3">
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Ручная корректировка</div>
            <div className="grid gap-2 sm:grid-cols-[140px_150px_1fr_auto]">
              <Input inputMode="decimal" placeholder="± сумма, BYN" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" aria-label="Сумма корректировки" />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Дата корректировки" />
              <Input placeholder="Комментарий (обязателен)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Комментарий" />
              <Button onClick={add}>Добавить</Button>
            </div>
            {err && <p className="mt-2 text-[12.5px] text-destructive" role="alert">{err}</p>}
            {isMonthClosed(state, date.slice(0, 7)) && <p className="mt-2 text-[12px] text-muted-foreground">Месяц {monthLabel(date.slice(0, 7))} закрыт — корректировка с этой датой будет отклонена.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
