import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { ExternalLink, FileSpreadsheet, Lock, LockOpen, Printer, Wallet, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useAppStore, useCurMonth } from "@/lib/store";
import { can } from "@/lib/rbac";
import { isMonthClosed, statementSheets, type StatementRow } from "@/lib/selectors";
import { useStatementRows } from "@/lib/server-data";
import { statementXlsxUrl } from "@/lib/api";
import { cn, compareRu, formatMoney, fullName, monthLabel, plural, round2 } from "@/lib/utils";
import { DataTable, DataTableColumnHeader } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/form-controls";
import { Tooltip } from "@/components/ui/popover";
import { Money, MonthPicker, PageHeader, PageSkeleton, useFakeLoading } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentDialog } from "@/components/shared/payment-dialog";
import { PrintPreview, useDefaultSigner } from "@/components/shared/print-preview";
import { StatementDoc } from "@/components/print/statement-doc";

export function StatementsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = useAppStore();
  const role = state.role;
  const canPay = can(role, "finance.edit");
  const loading = useFakeLoading(300);
  const sheets = statementSheets(state);
  const nowMonth = useCurMonth();
  const sheetId = sheets.find((x) => x.id === params.get("sheet"))?.id ?? (sheets.find((x) => x.id.startsWith("br_b_part")) ?? sheets[0])?.id;
  const month = params.get("month") ?? nowMonth;
  const closed = isMonthClosed(state, month);
  const isAdmin = role === "admin";
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };

  const [pay, setPay] = React.useState<{ open: boolean; studentId?: string }>({ open: false });
  const [printOpen, setPrintOpen] = React.useState(false);
  const defaultSigner = useDefaultSigner();
  const [signer, setSigner] = React.useState(defaultSigner);
  const accountant = state.signers.find((s) => s.position.toLowerCase().includes("бухгалтер"));

  React.useEffect(() => {
    if (params.get("pay") === "1" && canPay) {
      setPay({ open: true });
      const p = new URLSearchParams(params);
      p.delete("pay");
      setParams(p, { replace: true });
    }
  }, [params, setParams, canPay]);

  const branch = sheets.find((b) => b.id === sheetId);
  const branchId = state.branches.find((b) => sheetId === `br_${b.id}`)?.id ?? state.groups.find((g) => g.direction === "it")?.branchId;
  const rows = useStatementRows(sheetId ?? "", month);
  const totals = React.useMemo(
    () => ({
      opening: round2(rows.reduce((a, r) => a + r.opening, 0)),
      paid: round2(rows.reduce((a, r) => a + r.paid, 0)),
      consumed: round2(rows.reduce((a, r) => a + r.consumed, 0)),
      consumedCount: rows.reduce((a, r) => a + r.consumedCount, 0),
      closing: round2(rows.reduce((a, r) => a + r.closing, 0)),
      debtors: rows.filter((r) => r.closing < 0).length,
    }),
    [rows],
  );

  const columns = React.useMemo<ColumnDef<StatementRow, any>[]>(
    () => [
      {
        id: "idx",
        size: 40,
        enableSorting: false,
        enableHiding: false,
        header: "№",
        meta: { align: "center" },
        cell: ({ row }) => <span className="text-[12px] tabular text-muted-foreground">{row.index + 1}</span>,
      },
      {
        id: "name",
        accessorFn: (r) => fullName(r.student),
        size: 260,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Ученик" />,
        sortingFn: (a, b) => compareRu(fullName(a.original.student), fullName(b.original.student)),
        meta: { title: "Ученик" },
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={fullName(row.original.student)} size="md" />
            <div className="min-w-0">
              <div className="truncate font-medium">{fullName(row.original.student)}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{row.original.groups.map((g) => g.name).join(", ") || "без группы"}</div>
            </div>
          </div>
        ),
      },
      {
        id: "opening",
        accessorKey: "opening",
        size: 130,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Остаток на начало" />,
        meta: { title: "На начало", align: "right" },
        cell: ({ getValue }) => <Money value={getValue<number>()} colored />,
      },
      {
        id: "paid",
        accessorKey: "paid",
        size: 130,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Сдано" />,
        meta: { title: "Сдано", align: "right" },
        cell: ({ row }) => {
          const count = state.payments.filter((p) => p.studentId === row.original.student.id && p.date.startsWith(month)).length;
          return (
            <Tooltip content={canPay ? "Внести оплату" : undefined}>
              <button
                disabled={!canPay}
                onClick={(e) => {
                  e.stopPropagation();
                  if (closed) toast.error("Месяц закрыт", { description: "Платежи за закрытый месяц не вносятся. Откройте месяц." });
                  else setPay({ open: true, studentId: row.original.student.id });
                }}
                className={cn("group/pay inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -mr-1.5 transition-colors", canPay && "hover:bg-success/10")}
              >
                {row.original.paid ? <Money value={row.original.paid} className="text-success font-medium" /> : <span className="text-muted-foreground">—</span>}
                {count > 1 && <Badge variant="muted" className="px-1 py-0 text-[10px]">{count}</Badge>}
                {canPay && <Wallet className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/pay:opacity-100" />}
              </button>
            </Tooltip>
          );
        },
      },
      {
        id: "consumed",
        accessorKey: "consumed",
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Израсходовано" />,
        meta: { title: "Израсходовано", align: "right" },
        cell: ({ row }) =>
          row.original.consumedCount ? (
            <div className="leading-tight">
              <Money value={row.original.consumed} />
              {row.original.multi && <span className="ml-0.5 font-bold text-amber-600" title="Расход в нескольких группах: остаток один на ученика">*</span>}
              <div className="text-[11px] text-muted-foreground tabular">
                {row.original.consumedCount} зан.
                {row.original.multi && ` · ${Object.entries(row.original.byGroup).map(([gid, v]) => `${state.groups.find((g) => g.id === gid)?.code} ${formatMoney(v, false)}`).join(" + ")}${row.original.foreign ? " (др. лист)" : ""}`}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "closing",
        accessorKey: "closing",
        size: 140,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Остаток на конец" />,
        meta: { title: "На конец", align: "right" },
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return (
            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold", v < 0 ? "bg-destructive/10 text-destructive" : v < 20 ? "bg-warning/15 text-amber-700 dark:text-amber-300" : "bg-success/10 text-success")}>
              <Money value={v} />
            </span>
          );
        },
      },
      {
        id: "actions",
        size: 44,
        enableSorting: false,
        enableHiding: false,
        header: () => null,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon-xs" className="opacity-60 group-hover/row:opacity-100" onClick={(e) => { e.stopPropagation(); navigate(`/students/${row.original.student.id}?tab=finance`); }} aria-label="Карточка">
            <ExternalLink />
          </Button>
        ),
      },
    ],
    [state.payments, state.groups, month, canPay, navigate, closed],
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ведомости оплат"
        description="Остаток на начало + Сдано − Израсходовано (по журналам × цена группы) = Остаток на конец"
        actions={
          <>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => {
                  state.toggleMonthClosed(month);
                  toast.success(closed ? "Месяц открыт" : "Месяц закрыт", { description: closed ? "Правки снова разрешены" : "Журналы, платежи и проводки за месяц не редактируются" });
                }}
              >
                {closed ? <LockOpen /> : <Lock />} {closed ? "Открыть месяц" : "Закрыть месяц"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setPrintOpen(true)} disabled={!rows.length}><Printer /> Печать ведомости</Button>
            {state.dataMode === "api" && (
              <Button variant="outline" asChild disabled={!rows.length}>
                <a href={statementXlsxUrl(sheetId ?? "", month)} download><FileSpreadsheet /> XLSX</a>
              </Button>
            )}
            {canPay && <Button onClick={() => (closed ? toast.error("Месяц закрыт", { description: "Платежи за закрытый месяц не вносятся. Откройте месяц." }) : setPay({ open: true }))}><Wallet /> Внести оплату</Button>}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={sheetId} onValueChange={(v) => setParam("sheet", v)}>
          <TabsList className="h-9 flex-wrap">
            {sheets.map((b) => (
              <TabsTrigger key={b.id} value={b.id} className="gap-1.5">
                <span className="size-2 rounded-full" style={{ background: state.branches.find((x) => `br_${x.id}` === b.id)?.color ?? "#ec4899" }} />
                {state.branches.find((x) => `br_${x.id}` === b.id)?.shortName ?? "IT-класс"}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <MonthPicker value={month} onChange={(m) => setParam("month", m)} min="2026-09" />
        {closed ? <Badge variant="muted" className="gap-1 px-2.5 py-1"><Lock className="size-3" /> Месяц закрыт</Badge> : <Badge variant="success" className="px-2.5 py-1">Месяц открыт</Badge>}
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { l: "Учеников", v: String(rows.length), icon: <Users />, cls: "" },
          { l: "Остаток на начало", v: formatMoney(totals.opening), cls: totals.opening < 0 ? "text-destructive" : "" },
          { l: `Сдано за ${monthLabel(month).split(" ")[0].toLowerCase()}`, v: formatMoney(totals.paid), icon: <TrendingUp />, cls: "text-success" },
          { l: `Израсходовано · ${plural(totals.consumedCount, "занятие", "занятия", "занятий")}`, v: formatMoney(totals.consumed), icon: <TrendingDown />, cls: "" },
          { l: `Остаток на конец · ${plural(totals.debtors, "должник", "должника", "должников")}`, v: formatMoney(totals.closing), cls: totals.closing < 0 ? "text-destructive" : "" },
        ].map((k) => (
          <div key={k.l} className="rounded-xl border border-border/70 bg-card p-3.5 shadow-card">
            <div className="truncate text-[11.5px] text-muted-foreground">{k.l}</div>
            <div className={cn("mt-1 text-[18px] font-semibold tabular tracking-tight", k.cls)}>{k.v}</div>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.student.id}
        searchPlaceholder="Поиск ученика…"
        pinnedLeft={["idx", "name"]}
        hidePagination
        initialSorting={[{ id: "name", desc: false }]}
        maxHeight="calc(100dvh - 400px)"
        onRowClick={(r) => navigate(`/students/${r.student.id}?tab=finance`)}
        rowClassName={(r) => (r.closing < 0 ? "bg-destructive/[0.025]" : undefined)}
        emptyState={<EmptyState title="В филиале нет учеников" description="Добавьте учеников в группы этого филиала — ведомость сформируется автоматически." />}
        footer={
          <tr>
            <td className="sticky left-0 z-10 bg-muted px-3 py-2" />
            <td className="sticky left-[40px] z-10 bg-muted px-3 py-2 font-semibold">Итого по филиалу</td>
            <td className="px-3 py-2 text-right"><Money value={totals.opening} colored /></td>
            <td className="px-3 py-2 text-right text-success"><Money value={totals.paid} /></td>
            <td className="px-3 py-2 text-right"><Money value={totals.consumed} /><span className="ml-1 text-[11px] text-muted-foreground">({totals.consumedCount})</span></td>
            <td className="px-3 py-2 text-right font-semibold"><Money value={totals.closing} colored /></td>
            <td />
          </tr>
        }
      />

      <PaymentDialog open={pay.open} onOpenChange={(o) => setPay({ open: o })} studentId={pay.studentId} lockStudent={!!pay.studentId} branchId={branchId} />

      <PrintPreview
        open={printOpen}
        onOpenChange={setPrintOpen}
        title="Печать ведомости"
        description={`${branch?.name} · ${monthLabel(month)}`}
        signer={signer}
        onSignerChange={setSigner}
      >
        <StatementDoc rows={rows} branchName={branch?.name ?? ""} month={month} signer={signer} accountant={accountant ? { position: accountant.position, name: accountant.name } : undefined} />
      </PrintPreview>
    </div>
  );
}
