import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";
import type { AuditAction, AuditEntry } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import { DataTable, DataTableColumnHeader, inArrayFilter } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { PageHeader } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/empty-state";

const ACTION_META: Record<AuditAction, { label: string; variant: "success" | "info" | "destructive" | "warning" | "violet" | "secondary" | "muted" }> = {
  create: { label: "Создание", variant: "success" },
  update: { label: "Изменение", variant: "info" },
  delete: { label: "Удаление", variant: "destructive" },
  status: { label: "Статус", variant: "warning" },
  attendance: { label: "Посещаемость", variant: "violet" },
  payment: { label: "Оплата", variant: "success" },
  generate: { label: "Генерация", variant: "secondary" },
  membership: { label: "Состав группы", variant: "info" },
  settings: { label: "Настройки", variant: "secondary" },
};
const ENTITY_LABELS: Record<string, string> = {
  student: "Ученик", contract: "Договор", group: "Группа", journal: "Журнал", lesson: "Занятие", teacher: "Преподаватель",
  acts: "Акты", act: "Акт", addendum: "Доп. соглашение", payment: "Оплата", signer: "Подписант", branch: "Филиал", academicYear: "Учебный год",
};

export function AuditPage() {
  const audit = useAppStore((s) => s.audit);
  const columns = React.useMemo<ColumnDef<AuditEntry, any>[]>(
    () => [
      {
        accessorKey: "at",
        id: "at",
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Время" />,
        meta: { title: "Время" },
        cell: ({ getValue }) => <span className="tabular text-muted-foreground whitespace-nowrap">{formatDateTime(getValue<string>())}</span>,
      },
      {
        accessorKey: "userName",
        id: "user",
        size: 180,
        filterFn: inArrayFilter,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Пользователь" />,
        meta: { title: "Пользователь" },
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-2"><Avatar name={getValue<string>()} size="xs" /> {getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "action",
        id: "action",
        size: 130,
        filterFn: inArrayFilter,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Действие" />,
        meta: { title: "Действие" },
        cell: ({ getValue }) => {
          const m = ACTION_META[getValue<AuditAction>()];
          return <Badge variant={m.variant}>{m.label}</Badge>;
        },
      },
      {
        accessorKey: "entity",
        id: "entity",
        size: 130,
        filterFn: inArrayFilter,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Объект" />,
        meta: { title: "Объект" },
        cell: ({ getValue }) => <span className="text-muted-foreground">{ENTITY_LABELS[getValue<string>()] ?? getValue<string>()}</span>,
      },
      {
        accessorKey: "description",
        id: "description",
        header: "Описание",
        enableSorting: false,
        meta: { title: "Описание" },
        cell: ({ getValue }) => <span className="line-clamp-2">{getValue<string>()}</span>,
      },
    ],
    [],
  );
  const users = [...new Set(audit.map((a) => a.userName))];
  const entities = [...new Set(audit.map((a) => a.entity))];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Журнал изменений" description="Кто, когда и что изменил. Записи создаются автоматически при любых действиях в системе." />
      <DataTable
        columns={columns}
        data={audit}
        getRowId={(a) => a.id}
        searchPlaceholder="Поиск по описанию…"
        initialSorting={[{ id: "at", desc: true }]}
        facetedFilters={[
          { columnId: "action", title: "Действие", options: (Object.keys(ACTION_META) as AuditAction[]).map((k) => ({ value: k, label: ACTION_META[k].label })) },
          { columnId: "user", title: "Пользователь", options: users.map((u) => ({ value: u, label: u })) },
          { columnId: "entity", title: "Объект", options: entities.map((e) => ({ value: e, label: ENTITY_LABELS[e] ?? e })) },
        ]}
        maxHeight="calc(100dvh - 260px)"
        emptyState={<EmptyState icon={<History />} title="Пока пусто" description="Здесь появятся все изменения данных." />}
      />
    </div>
  );
}
