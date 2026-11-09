import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  Download, FileSignature, MoreHorizontal, Pencil, Printer, Trash2, UserCheck, UserPlus, UserX, Wallet, ExternalLink,
} from "lucide-react";
import type { Student } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { buildStudentRows, type StudentRow } from "@/lib/rows";
import { studentContracts, yearById } from "@/lib/selectors";
import { cn, compareRu, formatDate, formatPhone } from "@/lib/utils";
import { DataTable, DataTableColumnHeader, arrayIncludesSomeFilter, inArrayFilter } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/form-controls";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/popover";
import { PageHeader, PhoneLink, StatusBadge, Money, PageSkeleton, useFakeLoading } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PrintPreview, useDefaultSigner } from "@/components/shared/print-preview";
import { PaymentDialog } from "@/components/shared/payment-dialog";
import { RegistryDoc, REGISTRY_COLUMNS } from "@/components/print/registry-doc";
import { StudentFormSheet } from "./student-form";

/* ---------- История договоров (expandable row + профиль) ---------- */
export function ContractHistory({ studentId, compact }: { studentId: string; compact?: boolean }) {
  const state = useAppStore();
  const contracts = studentContracts(state, studentId);
  if (!contracts.length) return <p className="text-[12.5px] text-muted-foreground">Договоров нет</p>;
  return (
    <ol className={cn("relative flex flex-col border-l border-border/70 pl-4", compact ? "gap-2" : "gap-3")}>
      {contracts.map((c) => {
        const y = yearById(state, c.academicYearId);
        const adds = state.addendums.filter((a) => a.contractId === c.id);
        return (
          <li key={c.id} className="relative">
            <span className={cn("absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background", c.status === "active" ? "bg-success" : c.status === "terminated" ? "bg-destructive" : "bg-muted-foreground/50")} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-[13px] font-medium">{c.number}</span>
              <Badge variant="outline">{y?.label}</Badge>
              <StatusBadge status={c.status} />
              <span className="text-[12px] text-muted-foreground">
                от {formatDate(c.date)}
                {c.closedAt && ` · до ${formatDate(c.closedAt)}`}
              </span>
              {adds.length > 0 && (
                <Badge variant="violet">
                  <FileSignature /> {adds.length} доп.
                </Badge>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const globalFilterFn: FilterFn<StudentRow> = (row, _id, value: string) => {
  const q = String(value ?? "").trim().toLowerCase();
  if (!q) return true;
  const r = row.original;
  const digits = q.replace(/\D/g, "");
  return (
    r.fullName.toLowerCase().includes(q) ||
    r.parentName.toLowerCase().includes(q) ||
    (digits.length >= 3 && r.parentPhone.includes(digits)) ||
    r.allContractNumbers.toLowerCase().includes(q) ||
    r.groupNames.some((g) => g.toLowerCase().includes(q))
  );
};

export function StudentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const state = useAppStore();
  const DEMO_TODAY = state.settings.today;
  const { role, setStudentsStatus, deleteStudent } = state;
  const canEdit = can(role, "students.edit");
  const canFinance = can(role, "finance.view");
  const canPay = can(role, "finance.edit");
  const loading = useFakeLoading(300);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Student | undefined>();
  const [confirm, setConfirm] = React.useState<{ type: "deactivate" | "activate" | "delete"; ids: string[] } | null>(null);
  const [payFor, setPayFor] = React.useState<string | null>(null);
  const [filtered, setFiltered] = React.useState<StudentRow[]>([]);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [printRows, setPrintRows] = React.useState<StudentRow[]>([]);
  const [printCols, setPrintCols] = React.useState<string[]>(["name", "status", "branch", "groups", "grade", "birthYear", "parent", "phone", "contract", "year"]);
  const defaultSigner = useDefaultSigner();
  const [signer, setSigner] = React.useState(defaultSigner);

  React.useEffect(() => {
    if (params.get("new") === "1" && canEdit) {
      setEditing(undefined);
      setFormOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams, canEdit]);

  const rows = React.useMemo(() => buildStudentRows(state, canFinance), [state, canFinance]);

  const openPrint = (list: StudentRow[]) => {
    setPrintRows([...list].sort((a, b) => compareRu(a.fullName, b.fullName)));
    setPrintOpen(true);
  };

  const exportCsv = (list: StudentRow[]) => {
    const head = ["ФИО", "Статус", "Филиал", "Группы", "Класс", "Год рождения", "Представитель", "Телефон", "Договор", "Дата договора", "Учебный год"];
    const body = list.map((r) => [r.fullName, r.status === "active" ? "Активный" : "Неактивный", r.branchName, r.groupNames.join("; "), r.grade, r.birthYear, r.parentName, formatPhone(r.parentPhone), r.contractNumber, formatDate(r.contractDate), r.yearLabel]);
    const csv = [head, ...body].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reestr_${DEMO_TODAY}.csv`;
    a.click();
    toast.success(`Экспортировано ${list.length} строк`);
  };

  const columns = React.useMemo<ColumnDef<StudentRow, any>[]>(() => {
    const cols: ColumnDef<StudentRow, any>[] = [
      {
        accessorKey: "fullName",
        id: "fullName",
        size: 250,
        header: ({ column }) => <DataTableColumnHeader column={column} title="ФИО ученика" />,
        sortingFn: (a, b) => compareRu(a.original.fullName, b.original.fullName),
        meta: { title: "ФИО" },
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.original.fullName} size="md" />
            <div className="min-w-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/students/${row.original.id}`);
                }}
                className="block truncate text-left font-medium hover:text-primary hover:underline underline-offset-2"
              >
                {row.original.fullName}
              </button>
              <div className="truncate text-[11.5px] text-muted-foreground">
                {row.original.birthYear} г.р. · {row.original.grade} кл.
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        id: "status",
        size: 120,
        filterFn: inArrayFilter,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Статус" />,
        meta: { title: "Статус" },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorFn: (r) => r.branchId,
        id: "branch",
        size: 150,
        filterFn: inArrayFilter,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Филиал" />,
        meta: { title: "Филиал" },
        sortingFn: (a, b) => compareRu(a.original.branchShort, b.original.branchShort),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-2 rounded-full" style={{ background: row.original.branchColor }} />
            {row.original.branchShort}
          </span>
        ),
      },
      {
        accessorFn: (r) => r.groupIds,
        id: "groups",
        size: 220,
        filterFn: arrayIncludesSomeFilter,
        enableSorting: false,
        header: "Группы",
        meta: { title: "Группы" },
        cell: ({ row }) => {
          const names = row.original.groupNames;
          if (!names.length) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {names.slice(0, 2).map((n, i) => (
                <Badge key={n} variant="violet" className="max-w-[160px] cursor-pointer truncate" onClick={(e) => { e.stopPropagation(); navigate(`/groups/${row.original.groupIds[i]}`); }}>
                  {n}
                </Badge>
              ))}
              {names.length > 2 && (
                <Tooltip content={names.slice(2).join(", ")}>
                  <Badge variant="muted">+{names.length - 2}</Badge>
                </Tooltip>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "grade",
        id: "grade",
        size: 70,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Класс" />,
        meta: { title: "Класс", align: "center" },
        cell: ({ getValue }) => <span className="tabular">{getValue<number>()}</span>,
      },
      {
        accessorKey: "birthYear",
        id: "birthYear",
        size: 90,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Год рожд." />,
        meta: { title: "Год рождения", align: "center" },
        cell: ({ getValue }) => <span className="tabular">{getValue<number>()}</span>,
      },
      {
        accessorKey: "parentName",
        id: "parent",
        size: 240,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Законный представитель" />,
        meta: { title: "Представитель" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate">{row.original.parentName}</div>
            <PhoneLink phone={row.original.parentPhone} className="text-[12px]" />
          </div>
        ),
      },
      {
        accessorKey: "contractNumber",
        id: "contract",
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Договор" />,
        meta: { title: "Договор" },
        cell: ({ row }) =>
          row.original.contract ? (
            <div>
              <div className="font-mono text-[12.5px] font-medium">{row.original.contractNumber}</div>
              <div className="text-[11.5px] text-muted-foreground">от {formatDate(row.original.contractDate)}</div>
            </div>
          ) : (
            <Badge variant="warning">нет договора</Badge>
          ),
      },
      {
        accessorFn: (r) => r.yearId,
        id: "year",
        size: 100,
        filterFn: inArrayFilter,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Уч. год" />,
        meta: { title: "Учебный год" },
        cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.yearLabel || "—"}</span>,
      },
    ];
    if (canFinance) {
      cols.push({
        accessorKey: "balance",
        id: "balance",
        size: 120,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Остаток" className="justify-end" />,
        meta: { title: "Остаток", align: "right" },
        cell: ({ row }) => <Money value={row.original.balance} colored />,
      });
    }
    cols.push({
      id: "actions",
      size: 44,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      header: () => null,
      cell: ({ row }) => {
        const s = row.original.student;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={(e) => e.stopPropagation()} className="opacity-60 group-hover/row:opacity-100 data-[state=open]:opacity-100">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => navigate(`/students/${s.id}`)}>
                <ExternalLink /> Открыть карточку
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem onClick={() => { setEditing(s); setFormOpen(true); }}>
                  <Pencil /> Редактировать
                </DropdownMenuItem>
              )}
              {canPay && (
                <DropdownMenuItem onClick={() => setPayFor(s.id)}>
                  <Wallet /> Внести оплату
                </DropdownMenuItem>
              )}
              {can(role, "documents.edit") && (
                <DropdownMenuItem onClick={() => navigate(`/addendums?student=${s.id}`)}>
                  <FileSignature /> Доп. соглашение
                </DropdownMenuItem>
              )}
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  {s.status === "active" ? (
                    <DropdownMenuItem onClick={() => setConfirm({ type: "deactivate", ids: [s.id] })}>
                      <UserX /> Деактивировать
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => setConfirm({ type: "activate", ids: [s.id] })}>
                      <UserCheck /> Активировать
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem destructive onClick={() => setConfirm({ type: "delete", ids: [s.id] })}>
                    <Trash2 /> Удалить
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });
    return cols;
  }, [canEdit, canFinance, canPay, navigate, role]);

  const facets = React.useMemo(
    () => [
      { columnId: "branch", title: "Филиал", options: state.branches.map((b) => ({ value: b.id, label: b.shortName, color: b.color })) },
      { columnId: "groups", title: "Группа", options: state.groups.map((g) => ({ value: g.id, label: g.name })) },
      { columnId: "year", title: "Учебный год", options: state.academicYears.map((y) => ({ value: y.id, label: y.label })) },
      { columnId: "status", title: "Статус", options: [{ value: "active", label: "Активный" }, { value: "inactive", label: "Неактивный" }] },
    ],
    [state.branches, state.groups, state.academicYears],
  );

  if (loading) return <PageSkeleton />;

  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ученики и договоры"
        description={`${rows.length} в реестре · ${activeCount} активных · учебный год 2025/2026`}
        actions={
          <>
            <Button variant="outline" onClick={() => openPrint(filtered)}>
              <Printer /> Печать реестра
            </Button>
            {canEdit && (
              <Button onClick={() => { setEditing(undefined); setFormOpen(true); }}>
                <UserPlus /> Добавить ученика
              </Button>
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="ФИО, телефон, № договора…"
        globalFilterFn={globalFilterFn}
        facetedFilters={facets}
        enableSelection={canEdit}
        pinnedLeft={["fullName"]}
        initialSorting={[{ id: "fullName", desc: false }]}
        onRowClick={(r) => navigate(`/students/${r.id}`)}
        onFilteredRowsChange={setFiltered}
        maxHeight="calc(100dvh - 300px)"
        renderSubRow={(row: Row<StudentRow>) => (
          <div className="grid gap-4 px-6 py-4 md:grid-cols-[1fr_280px]">
            <div>
              <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">История договоров</h4>
              <ContractHistory studentId={row.original.id} compact />
            </div>
            <div className="flex flex-col gap-2 text-[12.5px]">
              <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Группы</h4>
              {row.original.groupIds.map((gid) => {
                const g = state.groups.find((x) => x.id === gid)!;
                return (
                  <div key={gid} className="rounded-md border border-border/70 bg-card px-2.5 py-1.5">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-muted-foreground">{g.schedule}</div>
                  </div>
                );
              })}
              {row.original.student.notes && <p className="rounded-md bg-warning/15 px-2.5 py-1.5 text-amber-800 dark:text-amber-200">{row.original.student.notes}</p>}
            </div>
          </div>
        )}
        bulkActions={(selected, clear) => (
          <>
            <Button variant="outline" size="xs" onClick={() => setConfirm({ type: "deactivate", ids: selected.filter((s) => s.status === "active").map((s) => s.id) })} disabled={!selected.some((s) => s.status === "active")}>
              <UserX /> Деактивировать
            </Button>
            <Button variant="outline" size="xs" onClick={() => setConfirm({ type: "activate", ids: selected.filter((s) => s.status === "inactive").map((s) => s.id) })} disabled={!selected.some((s) => s.status === "inactive")}>
              <UserCheck /> Активировать
            </Button>
            <Button variant="outline" size="xs" onClick={() => openPrint(selected)}>
              <Printer /> Печать выбранных
            </Button>
            <Button variant="outline" size="xs" onClick={() => { exportCsv(selected); clear(); }}>
              <Download /> CSV
            </Button>
          </>
        )}
        toolbarRight={
          <Button variant="outline" size="sm" className="h-8" onClick={() => exportCsv(filtered)}>
            <Download className="size-3.5" /> <span className="hidden sm:inline">Экспорт</span>
          </Button>
        }
        emptyState={
          <EmptyState
            title="Реестр пуст"
            description="Добавьте первого ученика — договор, группа и законный представитель заполняются в одной форме."
            action={canEdit ? <Button onClick={() => setFormOpen(true)}><UserPlus /> Добавить ученика</Button> : undefined}
          />
        }
      />

      <StudentFormSheet open={formOpen} onOpenChange={setFormOpen} student={editing} />
      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} studentId={payFor ?? undefined} lockStudent />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.type === "delete" ? "Удалить ученика?" : confirm?.type === "deactivate" ? "Деактивировать учеников?" : "Активировать учеников?"}
        description={
          confirm?.type === "delete"
            ? "Карточка, договоры и история посещаемости будут удалены без возможности восстановления."
            : confirm?.type === "deactivate"
              ? `Будет деактивировано: ${confirm?.ids.length}. Ученики останутся в реестре и истории, но исчезнут из активных журналов.`
              : `Будет активировано: ${confirm?.ids.length}.`
        }
        confirmLabel={confirm?.type === "delete" ? "Удалить" : confirm?.type === "deactivate" ? "Деактивировать" : "Активировать"}
        destructive={confirm?.type !== "activate"}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.type === "delete") {
            confirm.ids.forEach(deleteStudent);
            toast.success("Ученик удалён");
          } else {
            setStudentsStatus(confirm.ids, confirm.type === "activate" ? "active" : "inactive");
            toast.success(confirm.type === "activate" ? "Ученики активированы" : "Ученики деактивированы", { description: `${confirm.ids.length} записей обновлено` });
          }
          setConfirm(null);
        }}
      />

      <PrintPreview
        open={printOpen}
        onOpenChange={setPrintOpen}
        title="Печать реестра"
        description={`${printRows.length} учеников · выберите колонки и подписанта`}
        orientation="landscape"
        signer={signer}
        onSignerChange={setSigner}
        settings={
          <div className="flex flex-col gap-2">
            <Label>Колонки</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {REGISTRY_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-[12.5px]">
                  <Checkbox checked={printCols.includes(c.key)} onCheckedChange={(v) => setPrintCols((p) => (v ? [...p, c.key] : p.filter((k) => k !== c.key)))} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        }
      >
        <RegistryDoc rows={printRows} columns={printCols} signer={signer} date={DEMO_TODAY} subtitle={`Учебный год 2025/2026 · по состоянию на ${formatDate(DEMO_TODAY)}`} />
      </PrintPreview>
    </div>
  );
}
