import * as React from "react";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown,
  EyeOff, PlusCircle, Search, Settings2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/form-controls";
import { Popover, PopoverContent, PopoverTrigger, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Separator } from "@/components/ui/misc";
import { EmptyState } from "@/components/shared/empty-state";

/* ------------------------------------------------------------------ */
/*  Filter functions                                                   */
/* ------------------------------------------------------------------ */
export const inArrayFilter: FilterFn<any> = (row, columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  return filterValue.includes(String(row.getValue(columnId)));
};
export const arrayIncludesSomeFilter: FilterFn<any> = (row, columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  const v = row.getValue<string[]>(columnId) ?? [];
  return filterValue.some((f) => v.includes(f));
};

export interface ColumnMetaExt {
  title?: string;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
}
const meta = (c: Column<any, unknown>) => (c.columnDef.meta ?? {}) as ColumnMetaExt;

/* ------------------------------------------------------------------ */
/*  Column header with sorting                                         */
/* ------------------------------------------------------------------ */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) return <span className={cn("whitespace-nowrap", className)}>{title}</span>;
  const sorted = column.getIsSorted();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "-ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent whitespace-nowrap",
            sorted && "text-foreground",
            className,
          )}
        >
          {title}
          {sorted === "desc" ? <ArrowDown className="size-3.5" /> : sorted === "asc" ? <ArrowUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-50" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
          <ArrowUp /> По возрастанию
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown /> По убыванию
        </DropdownMenuItem>
        {sorted && (
          <DropdownMenuItem onClick={() => column.clearSorting()}>
            <X /> Сбросить
          </DropdownMenuItem>
        )}
        {column.getCanHide() && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              <EyeOff /> Скрыть колонку
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  Faceted filter                                                     */
/* ------------------------------------------------------------------ */
export interface FacetedFilterConfig {
  columnId: string;
  title: string;
  options: { value: string; label: string; color?: string }[];
}

function FacetedFilter<TData>({ column, title, options, rows }: FacetedFilterConfig & { column: Column<TData, unknown>; rows: Row<TData>[] }) {
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? []);
  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = r.getValue(column.id);
      if (Array.isArray(v)) v.forEach((x) => m.set(String(x), (m.get(String(x)) ?? 0) + 1));
      else m.set(String(v), (m.get(String(v)) ?? 0) + 1);
    }
    return m;
  }, [rows, column.id]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle className="size-3.5" />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <div className="flex gap-1">
                {selected.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selected.size} выбрано
                  </Badge>
                ) : (
                  options
                    .filter((o) => selected.has(o.value))
                    .map((o) => (
                      <Badge key={o.value} variant="secondary" className="rounded-sm px-1 font-normal">
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>Не найдено</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const isSel = selected.has(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    onSelect={() => {
                      const next = new Set(selected);
                      if (isSel) next.delete(o.value);
                      else next.add(o.value);
                      const arr = [...next];
                      column.setFilterValue(arr.length ? arr : undefined);
                    }}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border border-input",
                        isSel ? "border-primary bg-primary text-primary-foreground" : "opacity-60 [&_svg]:invisible",
                      )}
                    >
                      <Check className="size-3 text-current" strokeWidth={3} />
                    </div>
                    {o.color && <span className="size-2 rounded-full" style={{ background: o.color }} />}
                    <span className="truncate">{o.label}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular">{counts.get(o.value) ?? 0}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => column.setFilterValue(undefined)} className="justify-center text-center">
                    Сбросить фильтр
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  DataTable                                                          */
/* ------------------------------------------------------------------ */
export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  searchPlaceholder?: string;
  globalFilterFn?: FilterFn<TData>;
  facetedFilters?: FacetedFilterConfig[];
  toolbarRight?: React.ReactNode;
  toolbarLeft?: React.ReactNode;
  bulkActions?: (rows: TData[], clear: () => void) => React.ReactNode;
  enableSelection?: boolean;
  renderSubRow?: (row: Row<TData>) => React.ReactNode;
  onRowClick?: (row: TData) => void;
  emptyState?: React.ReactNode;
  initialSorting?: SortingState;
  initialPageSize?: number;
  initialColumnVisibility?: VisibilityState;
  pinnedLeft?: string[];
  maxHeight?: string;
  hidePagination?: boolean;
  hideToolbar?: boolean;
  rowClassName?: (row: TData) => string | undefined;
  footer?: React.ReactNode;
  className?: string;
  columnLabels?: Record<string, string>;
  onFilteredRowsChange?: (rows: TData[]) => void;
}

export function DataTable<TData>({
  columns: userColumns,
  data,
  getRowId,
  searchPlaceholder = "Поиск…",
  globalFilterFn,
  facetedFilters = [],
  toolbarRight,
  toolbarLeft,
  bulkActions,
  enableSelection,
  renderSubRow,
  onRowClick,
  emptyState,
  initialSorting = [],
  initialPageSize = 25,
  initialColumnVisibility = {},
  pinnedLeft = [],
  maxHeight,
  hidePagination,
  hideToolbar,
  rowClassName,
  footer,
  className,
  columnLabels = {},
  onFilteredRowsChange,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(initialColumnVisibility);
  const [expanded, setExpanded] = React.useState({});

  const columns = React.useMemo<ColumnDef<TData, any>[]>(() => {
    const extra: ColumnDef<TData, any>[] = [];
    if (enableSelection) {
      extra.push({
        id: "select",
        size: 36,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Выбрать все"
            className="translate-y-px"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Выбрать строку"
            className="translate-y-px"
          />
        ),
      });
    }
    if (renderSubRow) {
      extra.push({
        id: "expander",
        size: 32,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        header: () => null,
        cell: ({ row }) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              row.toggleExpanded();
            }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Развернуть"
          >
            <ChevronRight className={cn("size-4 transition-transform duration-200", row.getIsExpanded() && "rotate-90")} />
          </button>
        ),
      });
    }
    return [...extra, ...userColumns];
  }, [userColumns, enableSelection, renderSubRow]);

  const pinned = React.useMemo(() => {
    const base = [...(enableSelection ? ["select"] : []), ...(renderSubRow ? ["expander"] : []), ...pinnedLeft];
    return base;
  }, [enableSelection, renderSubRow, pinnedLeft]);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, columnFilters, globalFilter, rowSelection, columnVisibility, expanded, columnPinning: { left: pinned } },
    enableRowSelection: !!enableSelection,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => !!renderSubRow,
    globalFilterFn: globalFilterFn ?? "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: hidePagination ? undefined : getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    initialState: { pagination: { pageSize: initialPageSize } },
    autoResetPageIndex: false,
  });

  const isFiltered = columnFilters.length > 0 || globalFilter.length > 0;
  const filteredModel = table.getFilteredRowModel();
  React.useEffect(() => {
    onFilteredRowsChange?.(filteredModel.rows.map((r) => r.original));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredModel]);
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const rows = table.getRowModel().rows;
  const preFiltered = table.getPreFilteredRowModel().rows;
  const totalFiltered = table.getFilteredRowModel().rows.length;
  const pag = table.getState().pagination;
  const from = totalFiltered ? pag.pageIndex * pag.pageSize + 1 : 0;
  const to = Math.min((pag.pageIndex + 1) * pag.pageSize, totalFiltered);

  const stickyStyle = (column: Column<TData, unknown>, header = false): React.CSSProperties | undefined => {
    const isPinned = column.getIsPinned();
    const sizeSet = column.columnDef.size !== undefined || table.getState().columnSizing[column.id] !== undefined;
    const style: React.CSSProperties = {};
    if (sizeSet || isPinned) {
      style.width = column.getSize();
      style.minWidth = column.getSize();
      style.maxWidth = column.columnDef.maxSize ?? undefined;
    }
    if (isPinned === "left") {
      style.position = "sticky";
      style.left = column.getStart("left");
      style.zIndex = header ? 30 : 10;
    }
    return style;
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!hideToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 pr-7"
            />
            {globalFilter && (
              <button
                onClick={() => setGlobalFilter("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {toolbarLeft}
          {facetedFilters.map((f) => {
            const col = table.getColumn(f.columnId);
            if (!col) return null;
            return <FacetedFilter key={f.columnId} {...f} column={col} rows={preFiltered} />;
          })}
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => {
                table.resetColumnFilters();
                setGlobalFilter("");
              }}
            >
              Сбросить <X className="size-3.5" />
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {toolbarRight}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Settings2 className="size-3.5" />
                  <span className="hidden sm:inline">Колонки</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Показать колонки</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={c.getIsVisible()}
                      onCheckedChange={(v) => c.toggleVisibility(!!v)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {columnLabels[c.id] ?? meta(c).title ?? c.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      {enableSelection && selectedRows.length > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 animate-in fade-in-0 slide-in-from-top-1">
          <span className="text-[12.5px] font-medium">
            Выбрано: <span className="tabular">{selectedRows.length}</span>
          </span>
          <Separator orientation="vertical" className="h-4" />
          {bulkActions(
            selectedRows.map((r) => r.original),
            () => table.resetRowSelection(),
          )}
          <Button variant="ghost" size="xs" className="ml-auto" onClick={() => table.resetRowSelection()}>
            Снять выбор <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
        <div className="relative overflow-auto scrollbar-thin" style={{ maxHeight }}>
          <table className="w-full min-w-max caption-bottom text-[13px]" style={{ width: "100%" }}>
            <thead className="sticky top-0 z-20 bg-card">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border/70 shadow-[0_1px_0_0_var(--border)]">
                  {hg.headers.map((header) => {
                    const m = meta(header.column);
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        style={stickyStyle(header.column, true)}
                        className={cn(
                          "group/th relative h-9 bg-card px-3 text-left align-middle text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground",
                          m.align === "right" && "text-right",
                          m.align === "center" && "text-center",
                          header.column.getIsPinned() && "bg-card",
                          m.headerClassName,
                        )}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "absolute right-0 top-1/4 h-1/2 w-1 cursor-col-resize select-none rounded-full bg-border opacity-0 transition-opacity group-hover/th:opacity-100",
                              header.column.getIsResizing() && "bg-primary opacity-100",
                            )}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    {emptyState && !isFiltered ? (
                      emptyState
                    ) : (
                      <EmptyState
                        compact
                        title="Ничего не найдено"
                        description="Попробуйте изменить условия поиска или сбросить фильтры."
                        action={
                          isFiltered ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                table.resetColumnFilters();
                                setGlobalFilter("");
                              }}
                            >
                              Сбросить фильтры
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                      className={cn(
                        "group/row border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50 data-[state=selected]:bg-primary/[0.05]",
                        onRowClick && "cursor-pointer",
                        row.getIsExpanded() && "bg-muted/30",
                        rowClassName?.(row.original),
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const m = meta(cell.column);
                        return (
                          <td
                            key={cell.id}
                            style={stickyStyle(cell.column)}
                            className={cn(
                              "px-3 py-2 align-middle",
                              m.align === "right" && "text-right",
                              m.align === "center" && "text-center",
                              cell.column.getIsPinned() &&
                                "bg-card transition-colors group-hover/row:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] group-data-[state=selected]/row:bg-[color-mix(in_oklch,var(--primary)_5%,var(--card))]",
                              m.className,
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                    {row.getIsExpanded() && renderSubRow && (
                      <tr className="border-b border-border/60 bg-muted/20">
                        <td colSpan={row.getVisibleCells().length} className="p-0">
                          <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200">{renderSubRow(row)}</div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
            {footer && <tfoot className="sticky bottom-0 z-20 border-t border-border bg-muted/60 backdrop-blur font-medium">{footer}</tfoot>}
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!hidePagination && totalFiltered > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="text-[12.5px] text-muted-foreground tabular">
            {enableSelection && selectedRows.length > 0 ? (
              <>
                Выбрано {selectedRows.length} из {totalFiltered}
              </>
            ) : (
              <>
                Показано {from}–{to} из {totalFiltered}
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-[12.5px] text-muted-foreground">Строк</span>
              <Select value={String(pag.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
                <SelectTrigger size="sm" className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-[12.5px] font-medium tabular">
              Стр. {pag.pageIndex + 1} из {table.getPageCount() || 1}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                <ChevronsLeft />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                <ChevronRight />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                <ChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
