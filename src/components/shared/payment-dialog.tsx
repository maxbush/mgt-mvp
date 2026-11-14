import * as React from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import type { PaymentMethod } from "@/lib/types";
import { useAppStore, useToday } from "@/lib/store";
import { currentBalance, groupStudentIds, studentById } from "@/lib/selectors";
import { formatMoney, fullName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/form-controls";
import { StudentCombobox } from "./student-combobox";
import { Money } from "./bits";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "erip", label: "ЕРИП" },
  { value: "bepaid", label: "bePaid (онлайн)" },
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта (терминал)" },
];

export function PaymentDialog({
  open,
  onOpenChange,
  studentId,
  lockStudent,
  defaultDate: defaultDateProp,
  branchId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId?: string;
  lockStudent?: boolean;
  defaultDate?: string;
  branchId?: string;
}) {
  const state = useAppStore();
  const today = useToday();
  const defaultDate = defaultDateProp ?? today;
  const addPayment = useAppStore((s) => s.addPayment);
  const [sid, setSid] = React.useState(studentId ?? "");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(defaultDate);
  const [method, setMethod] = React.useState<PaymentMethod>("erip");
  const [comment, setComment] = React.useState("");
  const amountRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setSid(studentId ?? "");
      setAmount("");
      setDate(defaultDate);
      setMethod("erip");
      setComment("");
      if (studentId) setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [open, studentId, defaultDate]);

  const student = sid ? studentById(state, sid) : undefined;
  const balance = student ? currentBalance(state, student.id) : 0;
  const parsed = Number(amount.replace(",", "."));
  const valid = !!student && parsed > 0 && !!date;
  const candidates = branchId ? state.students.filter((s) => s.branchId === branchId || state.groups.some((g) => g.branchId === branchId && groupStudentIds(state, g.id).includes(s.id))) : undefined;

  const submit = async () => {
    if (!valid || !student) return;
    const res = await addPayment({ studentId: student.id, amount: Math.round(parsed * 100) / 100, date, method, comment: comment || undefined, payer: fullName(student) });
    if (!res.ok) {
      toast.error("Платёж не внесён", { description: res.reason });
      return;
    }
    toast.success(`Оплата ${formatMoney(parsed)} внесена`, { description: `${fullName(student)} · новый остаток ${formatMoney(balance + parsed)}` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" /> Внести оплату
          </DialogTitle>
          <DialogDescription>Платёж сразу отразится в ведомости и карточке ученика.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Ученик" required hint={!lockStudent ? "Поиск устойчив к опечаткам: ФИО, родитель, телефон, № договора" : undefined}>
            {lockStudent && student ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[13px] font-medium">{fullName(student)}</div>
            ) : (
              <StudentCombobox value={sid} onChange={setSid} students={candidates} autoFocus={!studentId} />
            )}
          </Field>
          {student && (
            <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-[12.5px]">
              <span className="text-muted-foreground">Текущий остаток</span>
              <Money value={balance} colored className="font-medium" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сумма, Br" required>
              <Input ref={amountRef} inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular text-right" />
            </Field>
            <Field label="Дата" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Способ оплаты">
            <SimpleSelect value={method} onValueChange={setMethod} options={PAYMENT_METHODS} />
          </Field>
          <Field label="Комментарий">
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: за февраль, чек №…" className="min-h-14" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!valid}>
              Внести {parsed > 0 ? formatMoney(parsed) : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
