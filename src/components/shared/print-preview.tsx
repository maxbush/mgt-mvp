import * as React from "react";
import { createPortal } from "react-dom";
import { Download, Printer, UserPen } from "lucide-react";
import { toast } from "sonner";
import type { Signer } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { cn, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";

export interface PrintSigner {
  position: string;
  name: string;
}

export function useDefaultSigner(): PrintSigner {
  const signers = useAppStore((s) => s.signers);
  const d = signers.find((s) => s.isDefault) ?? signers[0];
  return { position: d?.position ?? "Директор", name: d?.name ?? "" };
}

/** Рендерит документ в #print-root (виден только в @media print) и вызывает window.print */
export function PrintPortal({ children, orientation = "portrait" }: { children: React.ReactNode; orientation?: "portrait" | "landscape" }) {
  const root = typeof document !== "undefined" ? document.getElementById("print-root") : null;
  if (!root) return null;
  return createPortal(
    <>
      <style>{`@page { size: A4 ${orientation}; margin: 12mm 12mm 14mm; }`}</style>
      <div className="print-doc">{children}</div>
    </>,
    root,
  );
}

export function SignerPicker({
  value,
  onChange,
  className,
}: {
  value: PrintSigner;
  onChange: (s: PrintSigner) => void;
  className?: string;
}) {
  const signers = useAppStore((s) => s.signers);
  const upsertSigner = useAppStore((s) => s.upsertSigner);
  const [custom, setCustom] = React.useState(false);
  const matched = signers.find((s) => s.position === value.position && s.name === value.name);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Field label="Подписант">
        <Select
          value={custom ? "__custom" : (matched?.id ?? "__custom")}
          onValueChange={(v) => {
            if (v === "__custom") {
              setCustom(true);
              return;
            }
            setCustom(false);
            const s = signers.find((x) => x.id === v)!;
            onChange({ position: s.position, name: s.name });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Выберите подписанта" />
          </SelectTrigger>
          <SelectContent>
            {signers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="font-medium">{s.name}</span>
                <span className="ml-1.5 text-muted-foreground">— {s.position}</span>
              </SelectItem>
            ))}
            <SelectItem value="__custom">
              <span className="inline-flex items-center gap-1.5">
                <UserPen className="size-3.5" /> Другой подписант…
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {(custom || !matched) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Должность">
            <Input value={value.position} onChange={(e) => onChange({ ...value, position: e.target.value })} placeholder="Директор" />
          </Field>
          <Field label="ФИО">
            <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Иванов Иван Иванович" />
          </Field>
          <div className="sm:col-span-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                if (!value.name.trim()) return;
                const s: Signer = { id: uid("s"), position: value.position, name: value.name };
                upsertSigner(s);
                setCustom(false);
                toast.success("Подписант сохранён в справочник");
              }}
            >
              Сохранить в справочник
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface PrintPreviewProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  orientation?: "portrait" | "landscape";
  signer: PrintSigner;
  onSignerChange: (s: PrintSigner) => void;
  /** Доп. настройки слева от предпросмотра */
  settings?: React.ReactNode;
  children: React.ReactNode;
  onAfterPrint?: () => void;
}

export function PrintPreview({ open, onOpenChange, title, description, orientation = "portrait", signer, onSignerChange, settings, children, onAfterPrint }: PrintPreviewProps) {
  const [printing, setPrinting] = React.useState(false);

  const doPrint = () => {
    setPrinting(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
        setPrinting(false);
        onAfterPrint?.();
      }, 60);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="gap-0 p-0 max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-border/70 bg-muted/30 p-4 lg:w-80 lg:border-b-0 lg:border-r lg:overflow-y-auto scrollbar-thin">
            <SignerPicker value={signer} onChange={onSignerChange} />
            {settings}
            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button onClick={doPrint} loading={printing}>
                <Printer /> Печать
              </Button>
              <Button variant="outline" onClick={doPrint}>
                <Download /> Скачать PDF
              </Button>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Формат A4 {orientation === "landscape" ? "альбомный" : "книжный"}. Для PDF выберите «Сохранить как PDF» в диалоге печати.
              </p>
            </div>
          </aside>
          <div className="min-h-0 flex-1 overflow-auto bg-zinc-200/70 p-4 scrollbar-thin dark:bg-zinc-950/60 lg:p-8">
            <div
              className={cn(
                "print-doc mx-auto bg-white p-[12mm] text-black shadow-float",
                orientation === "landscape" ? "w-[297mm] min-h-[210mm]" : "w-[210mm] min-h-[297mm]",
              )}
              style={{ zoom: 0.9 }}
            >
              {children}
            </div>
          </div>
        </div>
        {printing && <PrintPortal orientation={orientation}>{children}</PrintPortal>}
      </DialogContent>
    </Dialog>
  );
}
