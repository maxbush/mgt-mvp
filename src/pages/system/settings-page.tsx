import * as React from "react";
import { toast } from "sonner";
import { Building2, CalendarRange, Calculator, Check, Database, Globe, Pencil, PenLine, Play, Plus, RotateCcw, Send, ShieldCheck, Star, Trash2, Webhook } from "lucide-react";
import type { AcademicYear, Branch, Role, Signer } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { ALL_PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/rbac";
import { currentGroupPrice, currentRate } from "@/lib/selectors";
import { runTests, type TestResult } from "@/lib/tests";
import { parseMoney } from "@/lib/bepaid";
import { cn, formatDate, formatMoney, monthLabel, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/bits";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#14b8a6", "#f43f5e"];

function BranchDialog({ open, onOpenChange, branch }: { open: boolean; onOpenChange: (o: boolean) => void; branch?: Branch }) {
  const upsertBranch = useAppStore((s) => s.upsertBranch);
  const [f, setF] = React.useState<Branch>({ id: "", name: "", shortName: "", address: "", color: COLORS[0] });
  React.useEffect(() => { if (open) setF(branch ?? { id: "", name: "", shortName: "", address: "", color: COLORS[0] }); }, [open, branch]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{branch ? "Редактировать филиал" : "Новый филиал"}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Название" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Гимназия №32" autoFocus /></Field>
          <Field label="Короткое имя" required><Input value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} placeholder="Гимназия 32" /></Field>
          <Field label="Адрес"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Цвет">
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setF({ ...f, color: c })} className={cn("size-7 rounded-full border-2 transition-transform hover:scale-110", f.color === c ? "border-foreground" : "border-transparent")} style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={!f.name.trim() || !f.shortName.trim()} onClick={() => { upsertBranch({ ...f, id: f.id || uid("b") }); toast.success("Филиал сохранён"); onOpenChange(false); }}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignerDialog({ open, onOpenChange, signer }: { open: boolean; onOpenChange: (o: boolean) => void; signer?: Signer }) {
  const upsertSigner = useAppStore((s) => s.upsertSigner);
  const [f, setF] = React.useState<Signer>({ id: "", position: "", name: "" });
  React.useEffect(() => { if (open) setF(signer ?? { id: "", position: "", name: "" }); }, [open, signer]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{signer ? "Редактировать подписанта" : "Новый подписант"}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Должность" required><Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="Заместитель директора" autoFocus /></Field>
          <Field label="ФИО полностью" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Иванов Иван Иванович" /></Field>
          <label className="flex items-center gap-2 text-[12.5px]"><Switch checked={!!f.isDefault} onCheckedChange={(v) => setF({ ...f, isDefault: v })} /> Подписант по умолчанию</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={!f.name.trim() || !f.position.trim()} onClick={() => { upsertSigner({ ...f, id: f.id || uid("s") }); toast.success("Подписант сохранён"); onOpenChange(false); }}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  const state = useAppStore();
  const { branches, academicYears, signers, groups, students, setCurrentYear, addAcademicYear, removeSigner, settings, setSettings } = state;
  const [branchDlg, setBranchDlg] = React.useState<{ open: boolean; branch?: Branch }>({ open: false });
  const [signerDlg, setSignerDlg] = React.useState<{ open: boolean; signer?: Signer }>({ open: false });
  const [yearDlg, setYearDlg] = React.useState(false);
  const [newYear, setNewYear] = React.useState({ label: "2027/2028", startDate: "2027-09-01", endDate: "2028-05-31" });
  const [rateFrom, setRateFrom] = React.useState(settings.today);
  const [rateVal, setRateVal] = React.useState("");
  const [todayVal, setTodayVal] = React.useState(settings.today);
  const [tests, setTests] = React.useState<TestResult[] | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const rates = [...settings.rates].sort((a, b) => (a.from < b.from ? 1 : -1));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Настройки" description="Справочники, права доступа и интеграции. Новые филиалы, группы и учебные годы добавляются без изменений в коде." />
      <Tabs defaultValue="branches">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="branches"><Building2 /> Филиалы</TabsTrigger>
          <TabsTrigger value="years"><CalendarRange /> Учебные годы</TabsTrigger>
          <TabsTrigger value="signers"><PenLine /> Подписанты</TabsTrigger>
          <TabsTrigger value="roles"><ShieldCheck /> Роли и доступ</TabsTrigger>
          <TabsTrigger value="calc"><Calculator /> Расчёты и демо</TabsTrigger>
          <TabsTrigger value="integrations"><Webhook /> Интеграции</TabsTrigger>
        </TabsList>

        <TabsContent value="branches">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle>Филиалы</CardTitle><CardDescription>Стоимость занятия задаётся на уровне группы, филиал — место проведения</CardDescription></div>
              <Button size="sm" onClick={() => setBranchDlg({ open: true })}><Plus /> Добавить</Button>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {branches.map((b) => {
                const bg = groups.filter((g) => g.branchId === b.id);
                const prices = [...new Set(bg.map((g) => currentGroupPrice(state, g)))];
                return (
                  <div key={b.id} className="group flex items-start gap-3 rounded-lg border border-border/70 p-3">
                    <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: b.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-[12px] text-muted-foreground">{b.address}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1 text-[11.5px]">
                        <Badge variant="secondary">{bg.length} групп</Badge>
                        <Badge variant="secondary">{students.filter((s) => s.branchId === b.id && s.status === "active").length} учеников</Badge>
                        {prices.map((p) => <Badge key={p} variant="outline">{formatMoney(p)}</Badge>)}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-xs" onClick={() => setBranchDlg({ open: true, branch: b })}><Pencil /></Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="years">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle>Учебные годы</CardTitle><CardDescription>Номера договоров уникальны в рамках учебного года</CardDescription></div>
              <Button size="sm" onClick={() => setYearDlg(true)}><Plus /> Добавить</Button>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border/60">
              {[...academicYears].reverse().map((y) => (
                <div key={y.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-[12px] font-semibold tabular">{y.label.slice(2, 4)}/{y.label.slice(7)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">{y.label} {y.isCurrent && <Badge variant="success"><Check /> текущий</Badge>}</div>
                    <div className="text-[12px] text-muted-foreground">{formatDate(y.startDate)} — {formatDate(y.endDate)} · {state.contracts.filter((c) => c.academicYearId === y.id).length} договоров</div>
                  </div>
                  {!y.isCurrent && <Button variant="outline" size="xs" onClick={() => { setCurrentYear(y.id); toast.success(`Текущий год: ${y.label}`); }}>Сделать текущим</Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signers">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div><CardTitle>Подписанты документов</CardTitle><CardDescription>Можно сменить прямо перед печатью любой формы</CardDescription></div>
              <Button size="sm" onClick={() => setSignerDlg({ open: true })}><Plus /> Добавить</Button>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border/60">
              {signers.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">{s.name} {s.isDefault && <Badge variant="violet"><Star /> по умолчанию</Badge>}</div>
                    <div className="text-[12px] text-muted-foreground">{s.position}</div>
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => setSignerDlg({ open: true, signer: s })}><Pencil /></Button>
                  <Button variant="ghost" size="icon-xs" disabled={signers.length <= 1} onClick={() => { removeSigner(s.id); toast.success("Подписант удалён"); }}><Trash2 className="text-destructive" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Матрица доступа (RBAC)</CardTitle>
              <CardDescription>Новая роль = новая колонка в конфигурации прав. Интерфейс подстраивается автоматически.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-2 font-medium">Право</th>
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                        <th key={r} className="px-3 py-2 text-center font-medium">
                          <div>{ROLE_LABELS[r]}</div>
                          <div className="text-[10.5px] font-normal normal-case tracking-normal text-muted-foreground/80">{ROLE_DESCRIPTIONS[r].split(":")[0]}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ALL_PERMISSIONS.reduce<Record<string, typeof ALL_PERMISSIONS>>((acc, p) => { (acc[p.group] ||= []).push(p); return acc; }, {})).map(([group, perms]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-muted/40"><td colSpan={4} className="px-5 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</td></tr>
                        {perms.map((p) => (
                          <tr key={p.key} className="border-b border-border/60 last:border-0">
                            <td className="px-5 py-2">{p.label} <span className="ml-1 font-mono text-[10.5px] text-muted-foreground">{p.key}</span></td>
                            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                              <td key={r} className="px-3 py-2 text-center">
                                {ROLE_PERMISSIONS[r].includes(p.key) ? <Check className="mx-auto size-4 text-success" /> : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calc" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Правило списания</CardTitle><CardDescription>Какие отметки списывают деньги с остатка ученика. «Присутствовал» списывает всегда. Остатки пересчитываются сразу.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {([
                ["chargeAbsent", "Н — отсутствовал без уважительной причины", "по умолчанию списывается"],
                ["chargeSick", "Б — болел", "по умолчанию не списывается"],
                ["chargeExcused", "У — уважительная причина", "по умолчанию не списывается"],
              ] as const).map(([k, label, hint]) => (
                <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5">
                  <span>
                    <span className="block text-[13px] font-medium">{label}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{hint}</span>
                  </span>
                  <Switch checked={settings[k]} onCheckedChange={(v) => { setSettings({ [k]: v }); toast.success("Правило списания изменено", { description: "Остатки и ведомости пересчитаны" }); }} />
                </label>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Ставка за занятие и налоги</CardTitle><CardDescription>Ставка действует с даты; акт берёт ставку на конец месяца. Округление до копеек (half up).</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-lg border border-border/70">
                {rates.map((r) => (
                  <div key={r.from} className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[13px] last:border-0">
                    <span>с {formatDate(r.from)}</span>
                    <span className="flex items-center gap-2 font-semibold tabular">
                      {formatMoney(r.rate)}
                      {rates.length > 1 && <Button variant="ghost" size="icon-xs" aria-label="Удалить ставку" onClick={() => setSettings({ rates: settings.rates.filter((x) => x.from !== r.from) })}><Trash2 className="text-destructive" /></Button>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input type="date" value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} aria-label="Ставка действует с" />
                <Input inputMode="decimal" placeholder="46,52" value={rateVal} onChange={(e) => setRateVal(e.target.value)} className="tabular text-right" aria-label="Новая ставка" />
                <Button
                  variant="outline"
                  onClick={() => {
                    const v = parseMoney(rateVal);
                    if (!(v > 0) || !rateFrom) return toast.error("Укажите дату и ставку больше нуля, например 46,52");
                    if (settings.rates.some((x) => x.from === rateFrom)) return toast.error("На эту дату ставка уже задана");
                    setSettings({ rates: [...settings.rates, { from: rateFrom, rate: v }] });
                    setRateVal("");
                    toast.success("Ставка добавлена");
                  }}
                >
                  Добавить
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Подоходный налог, %"><Input inputMode="decimal" defaultValue={settings.incomePct} onBlur={(e) => { const v = parseFloat(e.target.value.replace(",", ".")); if (v >= 0 && v < 100) setSettings({ incomePct: v }); }} className="tabular text-right" /></Field>
                <Field label="ФСЗН, %"><Input inputMode="decimal" defaultValue={settings.fsznPct} onBlur={(e) => { const v = parseFloat(e.target.value.replace(",", ".")); if (v >= 0 && v < 100) setSettings({ fsznPct: v }); }} className="tabular text-right" /></Field>
              </div>
              <p className="text-[12px] text-muted-foreground">Сейчас: {formatMoney(currentRate(state))} за занятие. Пример: 2 занятия → начислено 93,04 → 12,10 + 0,93 → к выплате 80,01.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Демо</CardTitle><CardDescription>«Сегодня» в демо задаёт «ближайшие занятия», текущий месяц и остатки на сегодня. Данные сохраняются в этом браузере.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                <Input type="date" value={todayVal} onChange={(e) => setTodayVal(e.target.value)} aria-label="Сегодня" />
                <Button onClick={() => { if (todayVal) { setSettings({ today: todayVal }); toast.success(`«Сегодня» = ${formatDate(todayVal)}`); } }}>Применить</Button>
                {[-1, 1].map((d) => (
                  <Button key={d} variant="outline" onClick={() => { const t = new Date(`${settings.today}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + d); const iso = t.toISOString().slice(0, 10); setTodayVal(iso); setSettings({ today: iso }); }}>{d > 0 ? "+1 день" : "−1 день"}</Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setTests(runTests())}><Play /> Запустить проверки расчётов</Button>
                <Button variant="outline" className="text-destructive" onClick={() => setResetOpen(true)}><RotateCcw /> Сбросить демо-данные</Button>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-[12.5px]">
                <div className="font-medium">Закрытые месяцы</div>
                <p className="mt-1 text-muted-foreground">{settings.closedMonths.length ? settings.closedMonths.map((m) => monthLabel(m)).join(", ") : "нет"} — править журнал, платежи и проводки нельзя. Открыть/закрыть месяц можно в «Ведомостях оплат».</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Интеграции</CardTitle><CardDescription>Готовность к подключению внешних систем</CardDescription></CardHeader>
            <CardContent className="flex flex-col divide-y divide-border/60">
              {[
                { icon: <Globe />, title: "Google Sheets", desc: "Импорт реестра учеников и исторических ведомостей", status: "готово к подключению" },
                { icon: <Webhook />, title: "bePaid", desc: "Выписка CSV уже загружается в разделе «Платежи»; автоматические вебхуки — после подключения сервера", status: "CSV работает" },
                { icon: <Database />, title: "1С:Бухгалтерия", desc: "Экспорт актов и ведомостей (XML / Excel)", status: "скоро" },
                { icon: <Send />, title: "Telegram-уведомления", desc: "Напоминания родителям об остатке и расписании", status: "скоро" },
              ].map((i) => (
                <div key={i.title} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{i.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.title}</div>
                    <div className="text-[12px] text-muted-foreground">{i.desc}</div>
                  </div>
                  <Badge variant={i.status === "скоро" ? "muted" : "info"}>{i.status}</Badge>
                  <Button variant="outline" size="xs" onClick={() => toast.info("Подключение интеграций выполняется администратором сервера")}>Настроить</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BranchDialog open={branchDlg.open} onOpenChange={(o) => setBranchDlg({ open: o, branch: o ? branchDlg.branch : undefined })} branch={branchDlg.branch} />
      <SignerDialog open={signerDlg.open} onOpenChange={(o) => setSignerDlg({ open: o, signer: o ? signerDlg.signer : undefined })} signer={signerDlg.signer} />
      <Dialog open={yearDlg} onOpenChange={setYearDlg}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Новый учебный год</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Название"><Input value={newYear.label} onChange={(e) => setNewYear({ ...newYear, label: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Начало"><Input type="date" value={newYear.startDate} onChange={(e) => setNewYear({ ...newYear, startDate: e.target.value })} /></Field>
              <Field label="Окончание"><Input type="date" value={newYear.endDate} onChange={(e) => setNewYear({ ...newYear, endDate: e.target.value })} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYearDlg(false)}>Отмена</Button>
            <Button onClick={() => { const y: AcademicYear = { id: uid("ay"), ...newYear, isCurrent: false }; addAcademicYear(y); toast.success(`Учебный год ${y.label} добавлен`); setYearDlg(false); }}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!tests} onOpenChange={(o) => !o && setTests(null)}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Проверки расчётов: {tests?.filter((t) => t.ok).length} из {tests?.length}</DialogTitle></DialogHeader>
          <ul className="flex max-h-[60vh] flex-col divide-y divide-border/60 overflow-auto text-[13px]" id="test-results">
            {tests?.map((t) => (
              <li key={t.name} className="flex gap-2.5 py-2">
                <span className={cn("w-4 font-bold", t.ok ? "text-success" : "text-destructive")}>{t.ok ? "✓" : "✗"}</span>
                <div>{t.name}{t.msg && <div className="text-[12px] text-destructive">{t.msg}</div>}</div>
              </li>
            ))}
          </ul>
          <DialogFooter><Button onClick={() => setTests(null)}>Закрыть</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Сбросить демо-данные?"
        description="Все данные вернутся к исходному демонстрационному набору: ученики, журналы, платежи, настройки и «Сегодня»."
        confirmLabel="Сбросить"
        destructive
        onConfirm={() => { state.resetDemo(); setTodayVal("2026-10-22"); toast.success("Демо-данные восстановлены"); }}
      />
    </div>
  );
}
