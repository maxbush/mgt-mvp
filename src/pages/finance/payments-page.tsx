import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Lock, Plus, Scissors, Search, Sparkles, X, XCircle } from "lucide-react";
import type { Payment, PaymentStatus } from "@/lib/types";
import { useAppStore, type ImportResult } from "@/lib/store";
import { can } from "@/lib/rbac";
import { DEMO_STATEMENT_CSV } from "@/lib/mock-data";
import { isMonthClosed, paymentCandidates, studentById, currentGroupPrice } from "@/lib/selectors";
import { splitEven, toK, normName, similarityPct } from "@/lib/calc";
import { parseMoney } from "@/lib/bepaid";
import { cn, formatDate, formatMoney, fullName, monthLabel, plural, shortName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, PageSkeleton, useFakeLoading } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentDialog, PAYMENT_METHODS } from "@/components/shared/payment-dialog";
import { StudentCombobox } from "@/components/shared/student-combobox";

const STATUS: Record<PaymentStatus, { label: string; variant: "success" | "warning" | "destructive" }> = {
  confirmed: { label: "подтверждён", variant: "success" },
  pending: { label: "на сопоставлении", variant: "warning" },
  rejected: { label: "отклонён", variant: "destructive" },
};
const methodLabel = (m: Payment["method"]) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

/* ---------- разделить платёж между детьми ---------- */
function SplitDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const state = useAppStore();
  const [rows, setRows] = React.useState<{ sid: string; amount: string }[]>([]);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    if (!payment) return;
    const parts = (payment.payer ?? "").split(/\s+(?:и|&)\s+|\s*[,;+/]\s*/i).map((x) => x.trim()).filter(Boolean);
    const ids = [...new Set(parts.map((p) => paymentCandidates(state, p, 1)[0]).filter((c) => c && c.pct >= 70).map((c) => c.student.id))];
    while (ids.length < 2) ids.push("");
    const amts = splitEven(toK(payment.amount), ids.length);
    setRows(ids.map((sid, i) => ({ sid, amount: (amts[i] / 100).toFixed(2).replace(".", ",") })));
    setErr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id]);
  const sum = rows.reduce((a, r) => a + (Number.isNaN(parseMoney(r.amount)) ? 0 : toK(parseMoney(r.amount))), 0);
  const diff = payment ? toK(payment.amount) - sum : 0;
  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scissors className="size-4 text-primary" /> Разделить платёж</DialogTitle>
          <DialogDescription>{payment?.payer} · {payment && formatDate(payment.date)} · всего {payment && formatMoney(payment.amount)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_130px_32px] items-center gap-2">
              <StudentCombobox value={r.sid} onChange={(v) => setRows((p) => p.map((x, j) => (j === i ? { ...x, sid: v } : x)))} />
              <Input inputMode="decimal" value={r.amount} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="tabular text-right" aria-label={`Сумма ${i + 1}`} />
              <Button variant="ghost" size="icon-xs" disabled={rows.length <= 2} onClick={() => setRows((p) => p.filter((_, j) => j !== i))} aria-label="Убрать"><X /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="self-start" onClick={() => setRows((p) => [...p, { sid: "", amount: "0,00" }])}><Plus /> Добавить ребёнка</Button>
          <p className={cn("text-[13px] font-medium", diff === 0 ? "text-success" : "text-destructive")} role="status">
            {diff === 0 ? "Сумма долей сходится ✓" : diff > 0 ? `Осталось распределить: ${formatMoney(diff / 100)}` : `Превышение на ${formatMoney(-diff / 100)}`}
          </p>
          {err && <p className="text-[12.5px] text-destructive" role="alert">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            onClick={async () => {
              if (!payment) return;
              const r = await state.splitPayment(payment.id, rows.map((x) => ({ studentId: x.sid, amount: Number.isNaN(parseMoney(x.amount)) ? 0 : parseMoney(x.amount) })));
              if (!r.ok) return setErr(r.reason);
              toast.success("Платёж разделён между учениками");
              onClose();
            }}
          >
            Разделить и подтвердить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- карточка очереди сопоставления ---------- */
function QueueCard({ p, canEdit, onSplit, onReject }: { p: Payment; canEdit: boolean; onSplit: () => void; onReject: () => void }) {
  const state = useAppStore();
  const cands = paymentCandidates(state, p.payer ?? "", 3);
  const best = cands[0]?.pct ?? 0;
  const multi = /\s(и|&)\s|[,;+/]/.test(p.payer ?? "");
  const closed = isMonthClosed(state, p.date.slice(0, 7));
  const [q, setQ] = React.useState("");
  const found = q
    ? state.students.filter((s) => normName(fullName(s)).includes(normName(q)) || normName(s.parentName).includes(normName(q))).slice(0, 5)
    : [];
  const confirm = async (sid: string) => {
    const r = await state.confirmPayment(p.id, sid);
    if (!r.ok) return toast.error("Нельзя сопоставить", { description: r.reason });
    const st = studentById(state, sid)!;
    toast.success(`Платёж ${formatMoney(p.amount)} зачислен`, { description: fullName(st) });
  };
  return (
    <Card className="flex flex-col gap-3 border-l-4 border-l-warning p-4" data-testid="queue-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{p.payer}</div>
          <div className="text-[12px] text-muted-foreground">{formatDate(p.date)} · {methodLabel(p.method)}{p.extId ? ` · ${p.extId}` : ""}</div>
        </div>
        <div className="text-[17px] font-semibold tabular">{formatMoney(p.amount)}</div>
      </div>
      {multi && <p className="rounded-md bg-info/10 px-2.5 py-1.5 text-[12.5px] text-info">Похоже, платёж за нескольких детей — используйте «Разделить».</p>}
      {!multi && best < 70 && <p className="rounded-md bg-warning/15 px-2.5 py-1.5 text-[12.5px] text-amber-800 dark:text-amber-200">Совпадений нет — найдите ученика вручную или отклоните платёж.</p>}
      <ul className="flex flex-col divide-y divide-border/60">
        {cands.map((c) => (
          <li key={c.student.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{fullName(c.student)}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{c.student.parentName}</div>
            </div>
            <span className={cn("w-12 text-right text-[14px] font-semibold tabular", c.pct >= 85 ? "text-success" : c.pct >= 60 ? "text-amber-600" : "text-destructive")} title="Схожесть ФИО">{c.pct}%</span>
            <Button size="sm" disabled={!canEdit} onClick={() => confirm(c.student.id)} aria-label={`Подтвердить: ${fullName(c.student)}`}>Подтвердить</Button>
          </li>
        ))}
      </ul>
      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти ученика вручную…" className="h-8 pl-8" aria-label="Поиск ученика" />
        </div>
        {found.length > 0 && (
          <div className="mt-1 overflow-hidden rounded-md border border-border/70">
            {found.map((s) => (
              <button key={s.id} disabled={!canEdit} onClick={() => confirm(s.id)} className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5 text-left text-[13px] last:border-0 hover:bg-accent disabled:opacity-60">
                <span>{fullName(s)}</span><span className="text-[11.5px] text-muted-foreground">{s.parentName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canEdit} onClick={onSplit}><Scissors /> Разделить</Button>
        <Button variant="outline" size="sm" className="text-destructive" disabled={!canEdit} onClick={onReject}><XCircle /> Отклонить</Button>
        {closed && <Badge variant="muted" className="gap-1"><Lock className="size-3" /> месяц закрыт</Badge>}
      </div>
    </Card>
  );
}

export function PaymentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = useAppStore();
  const canEdit = can(state.role, "finance.edit");
  const loading = useFakeLoading(250);
  const tab = (params.get("tab") as "all" | "pending" | "rejected") ?? "all";
  const [q, setQ] = React.useState("");
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [pay, setPay] = React.useState(false);
  const [split, setSplit] = React.useState<Payment | null>(null);
  const [reject, setReject] = React.useState<Payment | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const all = [...state.payments].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const cnt = { all: all.length, pending: all.filter((p) => p.status === "pending").length, rejected: all.filter((p) => p.status === "rejected").length };
  const nq = normName(q);
  const list = all.filter((p) => (tab === "all" || p.status === tab) && (!nq || normName(p.payer ?? "").includes(nq) || (p.studentId && normName(fullName(studentById(state, p.studentId)!)).includes(nq))));
  const month = state.settings.today.slice(0, 7);
  const income = all.filter((p) => p.status === "confirmed" && p.date.startsWith(month)).reduce((a, p) => a + toK(p.amount), 0) / 100;

  const run = async (csv: string) => {
    const r = await state.importStatement(csv);
    setResult(r);
    setParams(new URLSearchParams({ tab: "all" }), { replace: true });
    toast.success(`Выписка: загружено ${r.loaded}`, { description: `автоматически ${r.auto} · в очередь ${r.queued} · дублей ${r.dups}` });
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Платежи"
        description={`Поступило подтверждёнными за ${monthLabel(month).toLowerCase()}: ${formatMoney(income)}`}
        actions={
          <>
            {canEdit && <Button variant="outline" onClick={() => run(DEMO_STATEMENT_CSV)}><Sparkles /> Подставить демо-выписку</Button>}
            {canEdit && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const rd = new FileReader();
                    rd.onload = () => run(String(rd.result));
                    rd.readAsText(f, "utf-8");
                    e.target.value = "";
                  }}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp /> Загрузить выписку BePaid (CSV)</Button>
                <Button onClick={() => setPay(true)}><Plus /> Платёж вручную</Button>
              </>
            )}
          </>
        }
      />

      {result && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-[13px]" role="status" data-testid="import-result">
          <div>
            <b>Выписка обработана.</b> Загружено: <b>{result.loaded}</b> · сопоставлено автоматически: <b>{result.auto}</b> · в очередь: <b>{result.queued}</b> · дублей (проигнорировано): <b>{result.dups}</b>
            {result.closed > 0 && <> · в закрытых месяцах пропущено: <b>{result.closed}</b></>}
            {result.bad.length > 0 && <> · строк с ошибками: <b>{result.bad.length}</b> ({result.bad.join(", ")})</>}.
            {result.dups > 0 && <div className="mt-0.5 text-[12px] text-muted-foreground">Платёж с уже существующим id повторно не загружается.</div>}
          </div>
          <Button variant="ghost" size="icon-xs" onClick={() => setResult(null)} aria-label="Скрыть сообщение"><X /></Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setParams(new URLSearchParams({ tab: v }), { replace: true })}>
          <TabsList className="h-9">
            <TabsTrigger value="all">Все <Badge variant="muted" className="ml-1 px-1 py-0">{cnt.all}</Badge></TabsTrigger>
            <TabsTrigger value="pending">На сопоставлении <Badge variant={cnt.pending ? "warning" : "muted"} className="ml-1 px-1 py-0">{cnt.pending}</Badge></TabsTrigger>
            <TabsTrigger value="rejected">Отклонённые <Badge variant="muted" className="ml-1 px-1 py-0">{cnt.rejected}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Плательщик или ученик…" className="h-8 pl-8" />
        </div>
        <span className="text-[12px] text-muted-foreground">Формат CSV: <code className="rounded bg-muted px-1.5 py-0.5">дата;плательщик;сумма;id</code></span>
      </div>

      {tab === "pending" ? (
        list.length === 0 ? (
          <EmptyState title="Очередь пуста" description="Все платежи сопоставлены с учениками." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {list.map((p) => <QueueCard key={p.id} p={p} canEdit={canEdit} onSplit={() => setSplit(p)} onReject={() => setReject(p)} />)}
          </div>
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Дата</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead>Плательщик по выписке</TableHead>
                  <TableHead>Ученик</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="pr-5 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => {
                  const closed = isMonthClosed(state, p.date.slice(0, 7));
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="pl-5 tabular">{formatDate(p.date)}</TableCell>
                      <TableCell className="text-right font-medium tabular">{formatMoney(p.amount, false)}</TableCell>
                      <TableCell>{methodLabel(p.method)}{p.extId && <div className="text-[11px] text-muted-foreground">{p.extId}</div>}</TableCell>
                      <TableCell>{p.payer || "—"}</TableCell>
                      <TableCell>
                        {p.splits ? (
                          <div className="flex flex-col gap-0.5">
                            {p.splits.map((x) => (
                              <button key={x.studentId} className="text-left text-[13px] hover:text-primary" onClick={() => navigate(`/students/${x.studentId}?tab=finance`)}>
                                {shortName(studentById(state, x.studentId)!)} <span className="text-[11px] text-muted-foreground">{formatMoney(x.amount, false)}</span>
                              </button>
                            ))}
                          </div>
                        ) : p.studentId ? (
                          <button className="text-left font-medium hover:text-primary" onClick={() => navigate(`/students/${p.studentId}?tab=finance`)}>{fullName(studentById(state, p.studentId)!)}</button>
                        ) : (
                          <span className="text-muted-foreground">не определён</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</Badge>
                        {p.note && <div className="mt-0.5 text-[11px] text-muted-foreground">{p.note}</div>}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        {p.status === "pending" ? (
                          <Button size="xs" variant="outline" onClick={() => setParams(new URLSearchParams({ tab: "pending" }))}>Сопоставить</Button>
                        ) : closed ? (
                          <Badge variant="muted" className="gap-1"><Lock className="size-3" /></Badge>
                        ) : (
                          canEdit && p.status === "rejected" && <Button size="xs" variant="ghost" onClick={async () => { const r = await state.requeuePayment(p.id); if (!r.ok) toast.error("Нельзя", { description: r.reason }); }}>В очередь</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {list.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Платежей нет</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border/60 px-5 py-2 text-[12px] text-muted-foreground">{plural(list.length, "платёж", "платежа", "платежей")}</div>
        </Card>
      )}

      <PaymentDialog open={pay} onOpenChange={setPay} />
      <SplitDialog payment={split} onClose={() => setSplit(null)} />
      <ConfirmDialog
        open={!!reject}
        onOpenChange={(o) => !o && setReject(null)}
        title="Отклонить платёж?"
        description="Платёж не попадёт в остатки учеников. Его можно вернуть в очередь позже."
        confirmLabel="Отклонить"
        destructive
        onConfirm={async () => {
          if (reject) {
            const r = await state.rejectPayment(reject.id);
            if (!r.ok) toast.error("Нельзя отклонить", { description: r.reason });
            else toast.success("Платёж отклонён");
          }
          setReject(null);
        }}
      />
    </div>
  );
}

// чтобы не ругался линтер на неиспользуемые импорты при будущих правках
void CheckCircle2;
void similarityPct;
void currentGroupPrice;
