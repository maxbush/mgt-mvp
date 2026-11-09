import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, FileSignature, Printer, Save, Sparkles } from "lucide-react";
import { useAppStore, useToday } from "@/lib/store";
import { can } from "@/lib/rbac";
import { ADDENDUM_TEMPLATES } from "@/lib/mock-data";
import { branchById, currentGroupPrice, studentById, studentContracts, studentGroups } from "@/lib/selectors";
import { formatDate, formatMoney, formatPhone, fullName } from "@/lib/utils";
import { moneyToWords } from "@/components/print/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/form-controls";
import { PageHeader, PageSkeleton, useFakeLoading } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { StudentCombobox } from "@/components/shared/student-combobox";
import { PrintPreview, SignerPicker, useDefaultSigner, type PrintSigner } from "@/components/shared/print-preview";
import { AddendumDoc } from "@/components/print/addendum-doc";

const VARS = ["studentName", "birthYear", "parentName", "parentPhone", "contractNumber", "contractDate", "group", "branch", "price", "date"] as const;

function fill(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export function AddendumsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = useAppStore();
  const { role, addAddendum } = state;
  const canEdit = can(role, "documents.edit");
  const loading = useFakeLoading(250);
  const defaultSigner = useDefaultSigner();

  const [studentId, setStudentId] = React.useState(params.get("student") ?? "");
  const [contractId, setContractId] = React.useState("");
  const [templateId, setTemplateId] = React.useState(ADDENDUM_TEMPLATES[0].id);
  const [number, setNumber] = React.useState("1");
  const today = useToday();
  const [date, setDate] = React.useState(today);
  const [clause, setClause] = React.useState(ADDENDUM_TEMPLATES[0].clause);
  const [text, setText] = React.useState(ADDENDUM_TEMPLATES[0].text);
  const [effDate, setEffDate] = React.useState(today);
  const [price, setPrice] = React.useState("");
  const [groupId, setGroupId] = React.useState("");
  const [signer, setSigner] = React.useState<PrintSigner>(defaultSigner);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [printing, setPrinting] = React.useState<{ props: React.ComponentProps<typeof AddendumDoc>; title: string } | null>(null);

  const student = studentId ? studentById(state, studentId) : undefined;
  const contracts = student ? studentContracts(state, student.id) : [];
  const contract = contracts.find((c) => c.id === contractId) ?? contracts.find((c) => c.status === "active") ?? contracts[0];
  const groups = student ? studentGroups(state, student.id) : [];
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const template = ADDENDUM_TEMPLATES.find((t) => t.id === templateId)!;

  React.useEffect(() => {
    if (contract) {
      setContractId(contract.id);
      setNumber(String(state.addendums.filter((a) => a.contractId === contract.id).length + 1));
    }
    if (group) {
      setGroupId(group.id);
      setPrice(String(currentGroupPrice(state, group)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id]);

  React.useEffect(() => {
    setClause(template.clause);
    setText(template.text);
  }, [template]);

  // открыть сохранённое соглашение из карточки ученика
  React.useEffect(() => {
    const openId = params.get("open");
    if (!openId) return;
    const a = state.addendums.find((x) => x.id === openId);
    if (a) {
      const s = studentById(state, a.studentId);
      const c = state.contracts.find((x) => x.id === a.contractId);
      const sg = state.signers.find((x) => x.id === a.signerId);
      if (s && c) {
        setPrinting({
          title: `Доп. соглашение №${a.number}`,
          props: { number: a.number, date: a.date, contractNumber: c.number, contractDate: c.date, studentName: fullName(s), birthYear: s.birthYear, parentName: s.parentName, parentPhone: s.parentPhone, clause: a.clause, text: a.text, signer: sg ? { position: sg.position, name: sg.name } : defaultSigner },
        });
        setPrintOpen(true);
      }
    }
    const p = new URLSearchParams(params);
    p.delete("open");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("open")]);

  const vars: Record<string, string> = {
    studentName: student ? fullName(student) : "{{ФИО ученика}}",
    birthYear: student ? String(student.birthYear) : "{{год}}",
    parentName: student?.parentName ?? "{{представитель}}",
    parentPhone: student ? formatPhone(student.parentPhone) : "{{телефон}}",
    contractNumber: contract?.number ?? "{{№ договора}}",
    contractDate: contract ? formatDate(contract.date) : "{{дата}}",
    group: group?.name ?? "{{группа}}",
    branch: group ? (branchById(state, group.branchId)?.address ?? "") : "{{адрес}}",
    price: price ? formatMoney(Number(price.replace(",", ".")) || 0, false) : "{{стоимость}}",
    priceWords: price ? moneyToWords(Number(price.replace(",", ".")) || 0) : "",
    date: formatDate(effDate),
  };
  const filled = fill(text, vars);

  const docProps = student && contract
    ? { number, date, contractNumber: contract.number, contractDate: contract.date, studentName: fullName(student), birthYear: student.birthYear, parentName: student.parentName, parentPhone: student.parentPhone, clause, text: filled, signer }
    : null;

  const save = () => {
    if (!student || !contract) return;
    const s = state.signers.find((x) => x.name === signer.name) ?? state.signers[0];
    addAddendum({ contractId: contract.id, studentId: student.id, number, date, templateId, clause, text: filled, signerId: s.id });
    toast.success(`Доп. соглашение №${number} сохранено`, { description: `${fullName(student)} · договор ${contract.number}` });
    setNumber(String(Number(number) + 1));
  };

  if (loading) return <PageSkeleton />;

  const list = [...state.addendums].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Дополнительные соглашения" description="Выберите ученика и шаблон — реквизиты подставятся автоматически. Изменяемый пункт редактируется прямо здесь." />

      {!canEdit ? (
        <EmptyState title="Только просмотр" description="Создание документов доступно администратору." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[440px_1fr]">
          {/* Builder */}
          <Card className="h-fit">
            <CardHeader><CardTitle>Конструктор</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field label="Ученик" required>
                <StudentCombobox value={studentId} onChange={setStudentId} />
              </Field>
              {student && (
                <>
                  <Field label="Договор">
                    <SimpleSelect value={contract?.id} onValueChange={setContractId} options={contracts.map((c) => ({ value: c.id, label: `${c.number} от ${formatDate(c.date)} · ${state.academicYears.find((y) => y.id === c.academicYearId)?.label}${c.status !== "active" ? " (архив)" : ""}` }))} />
                  </Field>
                  <Field label="Шаблон">
                    <SimpleSelect value={templateId} onValueChange={setTemplateId} options={ADDENDUM_TEMPLATES.map((t) => ({ value: t.id, label: t.title }))} />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="№ соглашения"><Input value={number} onChange={(e) => setNumber(e.target.value)} className="tabular" /></Field>
                    <Field label="Дата" className="col-span-2"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-border p-3">
                    <Field label="Вступает в силу"><Input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} /></Field>
                    <Field label="Стоимость, Br"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="tabular text-right" /></Field>
                    <Field label="Группа" className="col-span-2">
                      <SimpleSelect value={group?.id} onValueChange={setGroupId} options={state.groups.map((g) => ({ value: g.id, label: g.name }))} placeholder="Выберите группу" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-3">
                    <Field label="Пункт"><Input value={clause} onChange={(e) => setClause(e.target.value)} className="tabular" /></Field>
                    <Field label="Переменные">
                      <div className="flex flex-wrap gap-1 pt-1">
                        {VARS.map((v) => (
                          <button key={v} onClick={() => setText((t) => `${t} {{${v}}}`)} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground">{`{{${v}}}`}</button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <Field label="Новая редакция пункта" hint="Переменные в {{ }} подставляются автоматически">
                    <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="text-[12.5px] leading-relaxed" />
                  </Field>
                  <SignerPicker value={signer} onChange={setSigner} />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => { save(); if (docProps) { setPrinting({ title: `Доп. соглашение №${number}`, props: docProps }); setPrintOpen(true); } }} disabled={!docProps}>
                      <Save /> Сохранить и печатать
                    </Button>
                    <Button variant="outline" onClick={() => { if (docProps) { setPrinting({ title: `Доп. соглашение №${number}`, props: docProps }); setPrintOpen(true); } }} disabled={!docProps}>
                      <Printer />
                    </Button>
                  </div>
                </>
              )}
              {!student && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-[12.5px] text-muted-foreground">
                  <Sparkles className="mx-auto mb-1.5 size-5 text-primary" />
                  Начните с выбора ученика — поиск понимает опечатки, телефоны и номера договоров.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live preview */}
          <div className="flex flex-col gap-4">
            <div className="overflow-auto rounded-xl border border-border/70 bg-zinc-200/60 p-4 shadow-card dark:bg-zinc-950/60 lg:p-6">
              <div className="print-doc mx-auto w-[210mm] max-w-full bg-white p-[14mm] text-black shadow-float" style={{ zoom: 0.85 }}>
                {docProps ? (
                  <AddendumDoc {...docProps} />
                ) : (
                  <div className="flex h-[200mm] items-center justify-center text-center text-neutral-400">
                    <div>
                      <FileSignature className="mx-auto mb-2 size-10" />
                      Предпросмотр появится после выбора ученика
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved list */}
      <Card>
        <CardHeader><CardTitle>Созданные соглашения <Badge variant="muted" className="ml-1">{list.length}</Badge></CardTitle></CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">Пока ничего не создано. Сохранённые документы появятся здесь и в карточке ученика.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {list.map((a) => {
                const s = studentById(state, a.studentId);
                const c = state.contracts.find((x) => x.id === a.contractId);
                const t = ADDENDUM_TEMPLATES.find((x) => x.id === a.templateId);
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex size-8 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300"><FileSignature className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">№{a.number} к договору {c?.number} — {s ? fullName(s) : ""}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{formatDate(a.date)} · {t?.title} · п. {a.clause}</div>
                    </div>
                    <Button variant="ghost" size="xs" onClick={() => s && navigate(`/students/${s.id}`)}><ExternalLink /> Ученик</Button>
                    <Button variant="outline" size="xs" onClick={() => { const p = new URLSearchParams(params); p.set("open", a.id); setParams(p); }}><Printer /> Печать</Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {printing && (
        <PrintPreview open={printOpen} onOpenChange={(o) => { setPrintOpen(o); if (!o) setPrinting(null); }} title={printing.title} signer={printing.props.signer} onSignerChange={(sg) => setPrinting({ ...printing, props: { ...printing.props, signer: sg } })}>
          <AddendumDoc {...printing.props} />
        </PrintPreview>
      )}
    </div>
  );
}
