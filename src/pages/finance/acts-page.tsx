import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, FileCheck2, Pencil, Printer, Sparkles, Trash2 } from "lucide-react";
import type { Act } from "@/lib/types";
import { useAppStore, useCurMonth, useToday } from "@/lib/store";
import { can } from "@/lib/rbac";
import { actCalc, currentRate, isMonthClosed, teacherLessonsInMonth } from "@/lib/selectors";
import { cn, formatMoney, fullName, monthGenitive, monthLabel, plural, round2, shortName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, MonthPicker, PageHeader, PageSkeleton, StatusBadge, useFakeLoading } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PrintPreview, SignerPicker, useDefaultSigner, type PrintSigner } from "@/components/shared/print-preview";
import { ActDoc } from "@/components/print/act-doc";

function GenerateDialog({ open, onOpenChange, month }: { open: boolean; onOpenChange: (o: boolean) => void; month: string }) {
  const state = useAppStore();
  const { generateActs } = state;
  const actRate = currentRate(state, month);
  const [rate, setRate] = React.useState(String(actRate));
  const defaultSigner = useDefaultSigner();
  const [signer, setSigner] = React.useState<PrintSigner>(defaultSigner);
  React.useEffect(() => { if (open) setRate(String(actRate)); }, [open, actRate]);
  const rateNum = Number(rate.replace(",", ".")) || 0;
  const existing = new Set(state.acts.filter((a) => a.month === month).map((a) => a.teacherId));
  const preview = state.teachers
    .filter((t) => t.status === "active")
    .map((t) => ({ t, count: teacherLessonsInMonth(state, t.id, month).length, exists: existing.has(t.id) }))
    .filter((p) => p.count > 0);
  const toCreate = preview.filter((p) => !p.exists);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Сформировать акты за {monthGenitive(month)}</DialogTitle>
          <DialogDescription>Количество занятий берётся из журналов с учётом замен. Ставку и количество можно поправить вручную после генерации.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="flex flex-col gap-3">
            <Field label="Ставка за занятие, Br">
              <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="tabular text-right" />
            </Field>
            <SignerPicker value={signer} onChange={setSigner} />
          </div>
          <div className="overflow-hidden rounded-lg border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-3">Преподаватель</TableHead>
                  <TableHead className="text-center">Зан.</TableHead>
                  <TableHead className="text-right">К выплате</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map(({ t, count, exists }) => (
                  <TableRow key={t.id} className={cn(exists && "opacity-50")}>
                    <TableCell className="pl-3">
                      {shortName(t)} {exists && <Badge variant="muted">уже есть</Badge>}
                    </TableCell>
                    <TableCell className="text-center tabular">{count}</TableCell>
                    <TableCell className="text-right"><Money value={actCalc(count, rateNum).net} /></TableCell>
                  </TableRow>
                ))}
                {preview.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">В этом месяце занятий нет</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!toCreate.length || rateNum <= 0}
            onClick={async () => {
              const s = state.signers.find((x) => x.name === signer.name) ?? state.signers[0];
              const n = await generateActs(month, rateNum, s.id);
              toast.success(`Сформировано ${plural(n, "акт", "акта", "актов")}`, { description: monthLabel(month) });
              onOpenChange(false);
            }}
          >
            <FileCheck2 /> Сформировать {toCreate.length ? `(${toCreate.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditActDialog({ act, onClose }: { act: Act | null; onClose: () => void }) {
  const updateAct = useAppStore((s) => s.updateAct);
  const [count, setCount] = React.useState("");
  const [rate, setRate] = React.useState("");
  React.useEffect(() => {
    if (act) { setCount(String(act.lessonsCount)); setRate(String(act.rate)); }
  }, [act]);
  const c = Number(count) || 0;
  const r = Number(rate.replace(",", ".")) || 0;
  const calc = actCalc(c, r);
  return (
    <Dialog open={!!act} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Ручная корректировка</DialogTitle>
          <DialogDescription>Акт №{act?.number}. Источник станет «ручной ввод».</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Количество занятий"><Input type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} className="tabular text-right" /></Field>
          <Field label="Ставка, Br"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="tabular text-right" /></Field>
        </div>
        <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-[12.5px]">
          {[
            ["Начислено", calc.gross],
            ["Подоходный 13%", -calc.incomeTax],
            ["ФСЗН 1%", -calc.fszn],
          ].map(([l, v]) => (
            <div key={String(l)} className="flex justify-between py-0.5"><span className="text-muted-foreground">{l}</span><Money value={Number(v)} /></div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border/70 pt-1.5 font-semibold"><span>К выплате</span><Money value={calc.net} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={() => { if (act) updateAct(act.id, { lessonsCount: c, rate: r, source: "manual" }); toast.success("Акт обновлён"); onClose(); }}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActsPage() {
  const [params, setParams] = useSearchParams();
  const state = useAppStore();
  const { role, updateAct, deleteAct } = state;
  const canEdit = can(role, "acts.edit");
  const loading = useFakeLoading(250);
  const nowMonth = useCurMonth();
  const today = useToday();
  const month = params.get("month") ?? nowMonth;
  const closed = isMonthClosed(state, month);
  const [gen, setGen] = React.useState(false);
  const [edit, setEdit] = React.useState<Act | null>(null);
  const [del, setDel] = React.useState<Act | null>(null);
  const [printAct, setPrintAct] = React.useState<Act | null>(null);
  const defaultSigner = useDefaultSigner();
  const [signer, setSigner] = React.useState<PrintSigner>(defaultSigner);

  React.useEffect(() => {
    if (params.get("generate") === "1" && canEdit) {
      setGen(true);
      const p = new URLSearchParams(params);
      p.delete("generate");
      setParams(p, { replace: true });
    }
  }, [params, setParams, canEdit]);

  const acts = state.acts.filter((a) => a.month === month).sort((a, b) => a.number.localeCompare(b.number));
  const totals = {
    gross: round2(acts.reduce((a, x) => a + x.gross, 0)),
    tax: round2(acts.reduce((a, x) => a + x.incomeTax, 0)),
    fszn: round2(acts.reduce((a, x) => a + x.fszn, 0)),
    net: round2(acts.reduce((a, x) => a + x.net, 0)),
    lessons: acts.reduce((a, x) => a + x.lessonsCount, 0),
  };
  const openPrint = (a: Act) => {
    const s = state.signers.find((x) => x.id === a.signerId);
    if (s) setSigner({ position: s.position, name: s.name });
    setPrintAct(a);
  };

  if (loading) return <PageSkeleton />;

  const printTeacher = printAct ? state.teachers.find((t) => t.id === printAct.teacherId) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Акты выполненных работ"
        description={`Ставка ${formatMoney(currentRate(state, month))} за занятие · удержания: подоходный ${state.settings.incomePct}%, ФСЗН ${state.settings.fsznPct}%${closed ? " · месяц закрыт" : ""}`}
        actions={
          <>
            <MonthPicker value={month} onChange={(m) => { const p = new URLSearchParams(params); p.set("month", m); setParams(p, { replace: true }); }} min="2026-09" />
            {canEdit && <Button onClick={() => setGen(true)}><Sparkles /> Сформировать</Button>}
          </>
        }
      />

      {acts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { l: "Актов", v: `${acts.length} · ${acts.filter((a) => a.status === "signed").length} подписано` },
            { l: "Занятий", v: String(totals.lessons) },
            { l: "Начислено", v: formatMoney(totals.gross) },
            { l: "Удержано (13% + 1%)", v: formatMoney(round2(totals.tax + totals.fszn)) },
            { l: "К выплате", v: formatMoney(totals.net), cls: "text-success" },
          ].map((k) => (
            <div key={k.l} className="rounded-xl border border-border/70 bg-card p-3.5 shadow-card">
              <div className="text-[11.5px] text-muted-foreground">{k.l}</div>
              <div className={cn("mt-1 text-[18px] font-semibold tabular tracking-tight", k.cls)}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {acts.length === 0 ? (
          <EmptyState
            title={`Актов за ${monthGenitive(month)} ещё нет`}
            description="Система посчитает занятия каждого преподавателя по журналам (включая замены), применит ставку и удержания — останется только проверить и распечатать."
            action={canEdit ? <Button onClick={() => setGen(true)}><Sparkles /> Сформировать акты</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">№</TableHead>
                  <TableHead>Преподаватель</TableHead>
                  <TableHead className="text-center">Занятий</TableHead>
                  <TableHead className="text-right">Ставка</TableHead>
                  <TableHead className="text-right">Начислено</TableHead>
                  <TableHead className="text-right">Подох. 13%</TableHead>
                  <TableHead className="text-right">ФСЗН 1%</TableHead>
                  <TableHead className="text-right">К выплате</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="pr-5 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acts.map((a) => {
                  const t = state.teachers.find((x) => x.id === a.teacherId);
                  const journalCount = teacherLessonsInMonth(state, a.teacherId, a.month).length;
                  const diff = a.source === "journal" && journalCount !== a.lessonsCount;
                  return (
                    <TableRow key={a.id} className="group/row">
                      <TableCell className="pl-5 font-mono text-[12.5px]">{a.number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={t ? fullName(t) : "?"} size="md" />
                          <div>
                            <div className="font-medium">{t ? fullName(t) : "—"}</div>
                            <div className="text-[11.5px] text-muted-foreground">{t?.contractNumber} · {a.source === "journal" ? "по журналам" : "ручной ввод"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular">
                        {a.lessonsCount}
                        {diff && (
                          <button className="ml-1 align-middle" onClick={() => updateAct(a.id, { lessonsCount: journalCount })} title={`В журналах сейчас ${journalCount}. Нажмите, чтобы обновить.`}>
                            <Badge variant="warning">≠ {journalCount}</Badge>
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right"><Money value={a.rate} /></TableCell>
                      <TableCell className="text-right"><Money value={a.gross} /></TableCell>
                      <TableCell className="text-right text-muted-foreground"><Money value={a.incomeTax} /></TableCell>
                      <TableCell className="text-right text-muted-foreground"><Money value={a.fszn} /></TableCell>
                      <TableCell className="text-right font-semibold"><Money value={a.net} /></TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="pr-5">
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="xs" onClick={() => openPrint(a)}><Printer /> Печать</Button>
                          {canEdit && a.status === "draft" && (
                            <>
                              <Button variant="ghost" size="icon-xs" onClick={() => (closed ? toast.error("Месяц закрыт", { description: "Ручное изменение количества занятий недоступно. Откройте месяц в «Ведомостях оплат»." }) : setEdit(a))} aria-label="Корректировать"><Pencil /></Button>
                              <Button variant="ghost" size="icon-xs" onClick={() => { updateAct(a.id, { status: "signed" }); toast.success(`Акт №${a.number} подписан`); }} aria-label="Подписать"><CheckCircle2 className="text-success" /></Button>
                              <Button variant="ghost" size="icon-xs" onClick={() => setDel(a)} aria-label="Удалить"><Trash2 className="text-destructive" /></Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-5" colSpan={2}>Итого</TableCell>
                  <TableCell className="text-center tabular">{totals.lessons}</TableCell>
                  <TableCell />
                  <TableCell className="text-right"><Money value={totals.gross} /></TableCell>
                  <TableCell className="text-right"><Money value={totals.tax} /></TableCell>
                  <TableCell className="text-right"><Money value={totals.fszn} /></TableCell>
                  <TableCell className="text-right"><Money value={totals.net} /></TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </Card>

      <GenerateDialog open={gen} onOpenChange={setGen} month={month} />
      <EditActDialog act={edit} onClose={() => setEdit(null)} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Удалить акт?"
        description={`Акт №${del?.number} будет удалён. Его можно сформировать заново.`}
        confirmLabel="Удалить"
        destructive
        onConfirm={() => { if (del) deleteAct(del.id); setDel(null); toast.success("Акт удалён"); }}
      />
      {printAct && printTeacher && (
        <PrintPreview
          open={!!printAct}
          onOpenChange={(o) => !o && setPrintAct(null)}
          title={`Акт №${printAct.number}`}
          description={`${fullName(printTeacher)} · ${monthLabel(printAct.month)}`}
          signer={signer}
          onSignerChange={(s) => {
            setSigner(s);
            const match = state.signers.find((x) => x.name === s.name && x.position === s.position);
            if (match && match.id !== printAct.signerId) updateAct(printAct.id, { signerId: match.id });
          }}
        >
          <ActDoc act={printAct} teacher={printTeacher} signer={signer} date={(() => { const last = new Date(Number(printAct.month.slice(0, 4)), Number(printAct.month.slice(5, 7)), 0).getDate(); const eom = `${printAct.month}-${String(last).padStart(2, "0")}`; return eom <= today ? eom : today; })()} />
        </PrintPreview>
      )}
    </div>
  );
}
