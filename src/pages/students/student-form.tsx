import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { Student } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { contractConflict, currentContract, currentYear, isContractNumberTaken, studentGroups } from "@/lib/selectors";
import { cn, fullName, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Checkbox, SimpleSelect } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";

const phoneOk = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length === 12 && d.startsWith("375");
};
const normalizePhone = (v: string) => `+${v.replace(/\D/g, "")}`;

const baseSchema = z.object({
  lastName: z.string().trim().min(2, "Укажите фамилию"),
  firstName: z.string().trim().min(2, "Укажите имя"),
  middleName: z.string().trim(),
  birthYear: z.string().trim().regex(/^$|^(19|20)\d{2}$/, "Четыре цифры или оставьте пустым"),
  grade: z.string().trim().min(1, "Укажите класс: 3, 6 лет, 3А(1)"),
  branchId: z.string().min(1, "Выберите филиал"),
  status: z.enum(["active", "inactive"]),
  parentName: z.string().trim().min(5, "Укажите ФИО законного представителя"),
  parentPhone: z.string().refine(phoneOk, "Формат: +375 (XX) XXX-XX-XX"),
  parentPhone2: z.string().refine((v) => !v || phoneOk(v), "Неверный формат"),
  notes: z.string(),
  openingBalance: z.number({ message: "Число" }),
  groupIds: z.array(z.string()),
  contractNumber: z.string().trim().min(3, "Укажите номер договора"),
  contractYearId: z.string().min(1, "Учебный год"),
  contractDate: z.string().min(10, "Укажите дату"),
});
type FormValues = z.infer<typeof baseSchema>;

export function StudentFormSheet({
  open,
  onOpenChange,
  student,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student?: Student;
  onSaved?: (id: string) => void;
}) {
  const state = useAppStore();
  const { upsertStudent, addStudentsToGroup, removeStudentFromGroup } = state;
  const year = currentYear(state);
  const existingContract = student ? currentContract(state, student.id) : undefined;
  const today = state.settings.today;

  const schema = React.useMemo(
    () =>
      baseSchema.superRefine((d, ctx) => {
        const c = d.contractNumber ? contractConflict(state, d.contractNumber, d.contractYearId, existingContract?.id) : null;
        if (c) ctx.addIssue({ code: "custom", path: ["contractNumber"], message: c.message });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.contracts, existingContract?.id],
  );

  const defaults = React.useMemo<FormValues>(
    () => ({
      lastName: student?.lastName ?? "",
      firstName: student?.firstName ?? "",
      middleName: student?.middleName ?? "",
      birthYear: student?.birthYear ? String(student.birthYear) : "",
      grade: student?.grade ?? "3",
      branchId: student?.branchId ?? state.branches[0]?.id ?? "",
      status: student?.status ?? "active",
      parentName: student?.parentName ?? "",
      parentPhone: student?.parentPhone ?? "",
      parentPhone2: student?.parentPhone2 ?? "",
      notes: student?.notes ?? "",
      openingBalance: student?.openingBalance ?? 0,
      groupIds: student ? studentGroups(state, student.id).map((g) => g.id) : [],
      contractNumber: existingContract?.number ?? "",
      contractYearId: existingContract?.academicYearId ?? year.id,
      contractDate: existingContract?.date ?? today,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [student?.id, open],
  );

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults, mode: "onChange" });
  const { register, handleSubmit, control, watch, reset, formState } = form;
  const { errors, isSubmitting } = formState;

  React.useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const branchId = watch("branchId");
  const contractNumber = watch("contractNumber");
  const contractYearId = watch("contractYearId");
  const branchGroups = state.groups.filter((g) => g.branchId === branchId && g.status === "active");
  const numberTaken = !!contractNumber && isContractNumberTaken(state, contractNumber, contractYearId, existingContract?.id);

  const onSubmit = handleSubmit((d) => {
    const id = student?.id ?? uid("st");
    const next: Student = {
      id,
      lastName: d.lastName,
      firstName: d.firstName,
      middleName: d.middleName,
      birthYear: d.birthYear ? Number(d.birthYear) : 0,
      grade: d.grade,
      branchId: d.branchId,
      status: d.status,
      parentName: d.parentName,
      parentPhone: normalizePhone(d.parentPhone),
      parentPhone2: d.parentPhone2 ? normalizePhone(d.parentPhone2) : undefined,
      notes: d.notes || undefined,
      createdAt: student?.createdAt ?? today,
      openingBalance: d.openingBalance,
    };
    upsertStudent(next, { id: existingContract?.id, number: d.contractNumber, academicYearId: d.contractYearId, date: d.contractDate });
    const prev = student ? studentGroups(state, student.id).map((g) => g.id) : [];
    const added = d.groupIds.filter((g) => !prev.includes(g));
    const removed = prev.filter((g) => !d.groupIds.includes(g));
    added.forEach((g) => addStudentsToGroup(g, [id]));
    removed.forEach((g) => removeStudentFromGroup(g, id));
    toast.success(student ? "Изменения сохранены" : "Ученик добавлен", { description: `${fullName(next)} · договор ${d.contractNumber}` });
    onOpenChange(false);
    onSaved?.(id);
  });

  const yearOptions = state.academicYears.map((y) => ({ value: y.id, label: `${y.label}${y.isCurrent ? " (текущий)" : ""}` }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent wide className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{student ? "Редактировать ученика" : "Новый ученик"}</SheetTitle>
          <SheetDescription>{student ? fullName(student) : "Создание ученика и договора на учебный год"}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="flex flex-col gap-6">
            {/* Ученик */}
            <section className="flex flex-col gap-3">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Ученик</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Фамилия" required error={errors.lastName?.message}>
                  <Input {...register("lastName")} autoFocus placeholder="Иванов" aria-invalid={!!errors.lastName} />
                </Field>
                <Field label="Имя" required error={errors.firstName?.message}>
                  <Input {...register("firstName")} placeholder="Иван" aria-invalid={!!errors.firstName} />
                </Field>
                <Field label="Отчество" error={errors.middleName?.message}>
                  <Input {...register("middleName")} placeholder="Иванович" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Год рождения" error={errors.birthYear?.message}>
                  <Input inputMode="numeric" maxLength={4} placeholder="можно пусто" {...register("birthYear")} className="tabular" aria-invalid={!!errors.birthYear} />
                </Field>
                <Field label="Класс" required error={errors.grade?.message}>
                  <Input placeholder="3, 6 лет, 3А(1)" {...register("grade")} className="tabular" aria-invalid={!!errors.grade} />
                </Field>
                <Field label="Филиал" required error={errors.branchId?.message} className="sm:col-span-2">
                  <Controller
                    control={control}
                    name="branchId"
                    render={({ field }) => (
                      <SimpleSelect value={field.value} onValueChange={field.onChange} options={state.branches.map((b) => ({ value: b.id, label: b.name }))} placeholder="Выберите филиал" />
                    )}
                  />
                </Field>
              </div>
              <Field label="Статус">
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <div className="inline-flex h-9 items-center rounded-md bg-muted p-1">
                      {(["active", "inactive"] as const).map((s) => (
                        <button
                          type="button"
                          key={s}
                          onClick={() => field.onChange(s)}
                          className={cn("rounded px-3 py-1 text-[12.5px] font-medium transition-colors", field.value === s ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground")}
                        >
                          {s === "active" ? "Активный" : "Неактивный"}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </Field>
            </section>

            {/* Представитель */}
            <section className="flex flex-col gap-3">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Законный представитель</h3>
              <Field label="ФИО" required error={errors.parentName?.message}>
                <Input {...register("parentName")} placeholder="Иванова Елена Петровна" aria-invalid={!!errors.parentName} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Телефон" required error={errors.parentPhone?.message}>
                  <Input {...register("parentPhone")} inputMode="tel" placeholder="+375 (29) 123-45-67" aria-invalid={!!errors.parentPhone} />
                </Field>
                <Field label="Доп. телефон" error={errors.parentPhone2?.message}>
                  <Input {...register("parentPhone2")} inputMode="tel" placeholder="+375 (33) 000-00-00" />
                </Field>
              </div>
            </section>

            {/* Договор */}
            <section className="flex flex-col gap-3">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{existingContract ? "Текущий договор" : "Договор"}</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Учебный год" required error={errors.contractYearId?.message}>
                  <Controller control={control} name="contractYearId" render={({ field }) => <SimpleSelect value={field.value} onValueChange={field.onChange} options={yearOptions} />} />
                </Field>
                <Field label="№ договора" required error={errors.contractNumber?.message}>
                  <div className="relative">
                    <Input {...register("contractNumber")} placeholder="ИШ-25/001" className="pr-8 font-mono" aria-invalid={!!errors.contractNumber} />
                    {contractNumber && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        {numberTaken ? <AlertCircle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-success" />}
                      </span>
                    )}
                  </div>
                </Field>
                <Field label="Дата" required error={errors.contractDate?.message}>
                  <Input type="date" {...register("contractDate")} aria-invalid={!!errors.contractDate} />
                </Field>
              </div>
              {contractNumber && !numberTaken && !errors.contractNumber && (
                <p className="-mt-1 text-[11.5px] text-success">Номер свободен в выбранном учебном году</p>
              )}
            </section>

            {/* Группы */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Группы филиала</h3>
                <Badge variant="muted">{watch("groupIds").length} выбрано</Badge>
              </div>
              <Controller
                control={control}
                name="groupIds"
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {branchGroups.length === 0 && <p className="text-[12.5px] text-muted-foreground">В этом филиале пока нет активных групп.</p>}
                    {branchGroups.map((g) => {
                      const checked = field.value.includes(g.id);
                      const t = state.teachers.find((x) => x.id === g.teacherId);
                      return (
                        <label
                          key={g.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                            checked ? "border-primary/40 bg-primary/[0.04]" : "border-border hover:bg-accent/50",
                          )}
                        >
                          <Checkbox checked={checked} onCheckedChange={(v) => field.onChange(v ? [...field.value, g.id] : field.value.filter((x) => x !== g.id))} className="mt-0.5" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium">{g.name}</span>
                            <span className="block text-[11.5px] text-muted-foreground">
                              {g.schedule} · {t ? `${t.lastName} ${t.firstName[0]}.` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
            </section>

            {/* Прочее */}
            <section className="flex flex-col gap-3">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Дополнительно</h3>
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <Field label="Остаток на начало года, Br" error={errors.openingBalance?.message} hint="Перенос из прошлого года">
                  <Input type="number" step="0.01" {...register("openingBalance", { valueAsNumber: true })} className="tabular text-right" />
                </Field>
                <Field label="Примечания">
                  <Textarea {...register("notes")} rows={2} placeholder="Особенности, пожелания родителей…" className="min-h-[60px]" />
                </Field>
              </div>
            </section>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={numberTaken}>
              {student ? "Сохранить" : "Создать ученика"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
