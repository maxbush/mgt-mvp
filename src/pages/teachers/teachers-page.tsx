import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, Landmark, Mail, Pencil, Plus, Search, ShieldCheck, UserCheck, UserX, Boxes, FileCheck2 } from "lucide-react";
import type { Teacher } from "@/lib/types";
import { useAppStore, useCurMonth } from "@/lib/store";
import { can } from "@/lib/rbac";
import { currentRate, teacherGroups, teacherLessonsInMonth } from "@/lib/selectors";
import { cn, copyToClipboard, formatDate, formatMoney, fullName, maskValue, plural, shiftMonth, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/form-controls";
import { ConfirmDialog, Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/popover";
import { PageHeader, PageSkeleton, PhoneLink, StatusBadge, useFakeLoading } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";

function TeacherFormSheet({ open, onOpenChange, teacher }: { open: boolean; onOpenChange: (o: boolean) => void; teacher?: Teacher }) {
  const upsertTeacher = useAppStore((s) => s.upsertTeacher);
  const actRate = useAppStore((s) => currentRate(s));
  const empty: Teacher = {
    id: "", lastName: "", firstName: "", middleName: "", phone: "", email: "", status: "active", contractNumber: "", contractDate: "",
    passport: { series: "MP", number: "", issuedBy: "", issuedAt: "", personalNumber: "" },
    bank: { iban: "BY", bankName: "", bic: "" }, address: "", rate: actRate, subjects: [],
  };
  const [f, setF] = React.useState<Teacher>(empty);
  const [subjects, setSubjects] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setF(teacher ?? empty);
      setSubjects(teacher?.subjects.join(", ") ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teacher?.id]);
  const set = (patch: Partial<Teacher>) => setF((p) => ({ ...p, ...patch }));
  const valid = f.lastName.trim() && f.firstName.trim() && f.contractNumber.trim();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent wide className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{teacher ? "Редактировать преподавателя" : "Новый преподаватель"}</SheetTitle>
          <SheetDescription>Паспортные и банковские данные используются только в актах и хранятся в защищённом виде.</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <Field label="Фамилия" required><Input value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} autoFocus /></Field>
            <Field label="Имя" required><Input value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} /></Field>
            <Field label="Отчество"><Input value={f.middleName} onChange={(e) => set({ middleName: e.target.value })} /></Field>
            <Field label="Телефон"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+375291234567" /></Field>
            <Field label="E-mail" className="sm:col-span-2"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Предметы (через запятую)" className="sm:col-span-3"><Input value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="Робототехника, Python" /></Field>
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Договор подряда</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="№ договора" required><Input value={f.contractNumber} onChange={(e) => set({ contractNumber: e.target.value })} className="font-mono" /></Field>
              <Field label="Дата"><Input type="date" value={f.contractDate} onChange={(e) => set({ contractDate: e.target.value })} /></Field>
              <Field label="Ставка, Br"><Input inputMode="decimal" value={String(f.rate)} onChange={(e) => set({ rate: Number(e.target.value.replace(",", ".")) || 0 })} className="tabular text-right" /></Field>
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Паспортные данные</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Серия"><Input value={f.passport.series} onChange={(e) => set({ passport: { ...f.passport, series: e.target.value } })} /></Field>
              <Field label="Номер"><Input value={f.passport.number} onChange={(e) => set({ passport: { ...f.passport, number: e.target.value } })} className="font-mono" /></Field>
              <Field label="Личный номер" className="sm:col-span-2"><Input value={f.passport.personalNumber} onChange={(e) => set({ passport: { ...f.passport, personalNumber: e.target.value } })} className="font-mono" /></Field>
              <Field label="Кем выдан" className="sm:col-span-3"><Input value={f.passport.issuedBy} onChange={(e) => set({ passport: { ...f.passport, issuedBy: e.target.value } })} /></Field>
              <Field label="Дата выдачи"><Input type="date" value={f.passport.issuedAt} onChange={(e) => set({ passport: { ...f.passport, issuedAt: e.target.value } })} /></Field>
              <Field label="Адрес регистрации" className="sm:col-span-4"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Банковские реквизиты</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="IBAN" className="sm:col-span-3"><Input value={f.bank.iban} onChange={(e) => set({ bank: { ...f.bank, iban: e.target.value.toUpperCase() } })} className="font-mono" /></Field>
              <Field label="Банк" className="sm:col-span-2"><Input value={f.bank.bankName} onChange={(e) => set({ bank: { ...f.bank, bankName: e.target.value } })} /></Field>
              <Field label="BIC"><Input value={f.bank.bic} onChange={(e) => set({ bank: { ...f.bank, bic: e.target.value.toUpperCase() } })} className="font-mono" /></Field>
            </div>
          </section>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              const t: Teacher = { ...f, id: f.id || uid("t"), subjects: subjects.split(",").map((s) => s.trim()).filter(Boolean) };
              upsertTeacher(t);
              toast.success(teacher ? "Данные сохранены" : "Преподаватель добавлен", { description: fullName(t) });
              onOpenChange(false);
            }}
          >
            {teacher ? "Сохранить" : "Добавить"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SensitiveRow({ label, value, revealed, mono }: { label: string; value: string; revealed: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <span className={cn("text-[12.5px] tabular", mono && "font-mono", !revealed && "tracking-wider text-muted-foreground")}>{revealed ? value : maskValue(value)}</span>
        {revealed && (
          <button className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={async () => { await copyToClipboard(value); toast.success(`${label} скопирован`); }}>
            <Copy className="size-3" />
          </button>
        )}
      </span>
    </div>
  );
}

export function TeachersPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const state = useAppStore();
  const CURRENT_MONTH = useCurMonth();
  const { role, setTeacherStatus } = state;
  const canEdit = can(role, "teachers.edit");
  const canSensitive = can(role, "teachers.sensitive");
  const loading = useFakeLoading(250);
  const [q, setQ] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(true);
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});
  const [form, setForm] = React.useState<{ open: boolean; teacher?: Teacher }>({ open: false });
  const [confirm, setConfirm] = React.useState<Teacher | null>(null);
  const focus = params.get("focus");

  React.useEffect(() => {
    if (focus && !loading) setTimeout(() => document.getElementById(`teacher-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, [focus, loading]);

  const teachers = state.teachers
    .filter((t) => showInactive || t.status === "active")
    .filter((t) => !q || fullName(t).toLowerCase().includes(q.toLowerCase()) || t.subjects.some((s) => s.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.lastName.localeCompare(b.lastName, "ru"));

  if (loading) return <PageSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Преподаватели"
        description={`${state.teachers.filter((t) => t.status === "active").length} активных · договоры подряда, реквизиты для актов`}
        actions={canEdit ? <Button onClick={() => setForm({ open: true })}><Plus /> Добавить</Button> : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ФИО или предмет…" className="h-8 pl-8" />
        </div>
        <label className="flex items-center gap-2 text-[12.5px]">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Показывать неактивных
        </label>
        {canSensitive && (
          <Badge variant="info" className="ml-auto">
            <ShieldCheck /> Чувствительные данные скрыты по умолчанию
          </Badge>
        )}
      </div>

      {teachers.length === 0 ? (
        <EmptyState title="Преподаватели не найдены" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {teachers.map((t, i) => {
            const groups = teacherGroups(state, t.id);
            const lessons = teacherLessonsInMonth(state, t.id, CURRENT_MONTH).length;
            const lastAct = state.acts.find((a) => a.teacherId === t.id && a.month === shiftMonth(CURRENT_MONTH, -1));
            const rev = !!revealed[t.id];
            return (
              <motion.div key={t.id} id={`teacher-${t.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className={cn("flex h-full flex-col p-4 transition-shadow", focus === t.id && "ring-2 ring-primary/40", t.status === "inactive" && "opacity-75")}>
                  <div className="flex items-start gap-3">
                    <Avatar name={fullName(t)} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-semibold tracking-tight">{fullName(t)}</h3>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.subjects.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-0.5">
                        <Tooltip content="Редактировать"><Button variant="ghost" size="icon-xs" onClick={() => setForm({ open: true, teacher: t })}><Pencil /></Button></Tooltip>
                        <Tooltip content={t.status === "active" ? "Деактивировать" : "Активировать"}>
                          <Button variant="ghost" size="icon-xs" onClick={() => setConfirm(t)}>{t.status === "active" ? <UserX /> : <UserCheck />}</Button>
                        </Tooltip>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                    <div className="flex items-center gap-1.5"><PhoneLink phone={t.phone} compact /></div>
                    <a href={`mailto:${t.email}`} className="flex items-center gap-1.5 truncate text-muted-foreground hover:text-primary"><Mail className="size-3.5" /> {t.email}</a>
                    <div className="text-muted-foreground">Договор <span className="font-mono text-foreground">{t.contractNumber}</span></div>
                    <div className="text-muted-foreground">от {formatDate(t.contractDate)}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5 text-center">
                    <button onClick={() => navigate(`/groups`)} className="rounded-md py-1 hover:bg-accent">
                      <div className="text-[15px] font-semibold tabular">{groups.length}</div>
                      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground"><Boxes className="mr-0.5 inline size-3" />групп</div>
                    </button>
                    <div className="py-1">
                      <div className="text-[15px] font-semibold tabular">{lessons}</div>
                      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">зан. в месяце</div>
                    </div>
                    <button onClick={() => can(role, "acts.view") && navigate(`/acts?month=${shiftMonth(CURRENT_MONTH, -1)}`)} className="rounded-md py-1 hover:bg-accent">
                      <div className="text-[15px] font-semibold tabular">{lastAct ? formatMoney(lastAct.net, false) : "—"}</div>
                      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground"><FileCheck2 className="mr-0.5 inline size-3" />акт, Br</div>
                    </button>
                  </div>

                  {groups.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {groups.map((g) => (
                        <Badge key={g.id} variant="violet" className="cursor-pointer" onClick={() => navigate(`/groups/${g.id}`)}>{g.name}</Badge>
                      ))}
                    </div>
                  )}

                  {canSensitive && (
                    <div className="mt-3 border-t border-border/70 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground"><Landmark className="size-3.5" /> Реквизиты</span>
                        <Button variant="ghost" size="xs" onClick={() => setRevealed((r) => ({ ...r, [t.id]: !rev }))}>
                          {rev ? <><EyeOff /> Скрыть</> : <><Eye /> Показать</>}
                        </Button>
                      </div>
                      <SensitiveRow label="Паспорт" value={`${t.passport.series} ${t.passport.number}`} revealed={rev} mono />
                      <SensitiveRow label="Личный номер" value={t.passport.personalNumber} revealed={rev} mono />
                      <SensitiveRow label="IBAN" value={t.bank.iban} revealed={rev} mono />
                      {rev && <div className="pt-1 text-[11.5px] text-muted-foreground">{t.bank.bankName} · BIC {t.bank.bic} · {t.address}</div>}
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="text-[12px] text-muted-foreground">{plural(teachers.length, "преподаватель", "преподавателя", "преподавателей")}</p>

      <TeacherFormSheet open={form.open} onOpenChange={(o) => setForm({ open: o, teacher: o ? form.teacher : undefined })} teacher={form.teacher} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.status === "active" ? "Деактивировать преподавателя?" : "Активировать преподавателя?"}
        description={confirm?.status === "active" ? "Преподаватель не будет попадать в генерацию актов и список замен. Группы останутся закреплены." : "Преподаватель снова станет доступен для групп, замен и актов."}
        confirmLabel={confirm?.status === "active" ? "Деактивировать" : "Активировать"}
        destructive={confirm?.status === "active"}
        onConfirm={() => { if (confirm) setTeacherStatus(confirm.id, confirm.status === "active" ? "inactive" : "active"); setConfirm(null); toast.success("Статус обновлён"); }}
      />
    </div>
  );
}
