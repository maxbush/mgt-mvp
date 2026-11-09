import * as React from "react";
import Fuse from "fuse.js";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import type { Student } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { branchById, currentContract } from "@/lib/selectors";
import { cn, formatPhone, fullName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

/** Fuzzy-поиск ученика (устойчив к опечаткам): ФИО, родитель, телефон, № договора */
export function useStudentFuse(students: Student[]) {
  const state = useAppStore();
  return React.useMemo(() => {
    const docs = students.map((s) => ({
      id: s.id,
      name: fullName(s),
      parent: s.parentName,
      phone: s.parentPhone,
      phoneFmt: formatPhone(s.parentPhone),
      contract: currentContract(state, s.id)?.number ?? "",
    }));
    return new Fuse(docs, {
      keys: [
        { name: "name", weight: 0.6 },
        { name: "parent", weight: 0.2 },
        { name: "phone", weight: 0.1 },
        { name: "phoneFmt", weight: 0.05 },
        { name: "contract", weight: 0.15 },
      ],
      threshold: 0.38,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, state.contracts]);
}

export function StudentCombobox({
  value,
  onChange,
  students,
  placeholder = "Найти ученика…",
  className,
  autoFocus,
}: {
  value?: string;
  onChange: (id: string) => void;
  students?: Student[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const all = useAppStore((s) => s.students);
  const state = useAppStore();
  const list = students ?? all;
  const fuse = useStudentFuse(list);
  const [open, setOpen] = React.useState(autoFocus ?? false);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const results = React.useMemo(() => {
    if (!q.trim()) return list.slice(0, 30);
    return fuse
      .search(q)
      .slice(0, 30)
      .map((r) => list.find((s) => s.id === r.item.id)!)
      .filter(Boolean);
  }, [q, fuse, list]);

  React.useEffect(() => setActive(0), [q]);
  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const selected = list.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("h-9 w-full justify-between px-3 font-normal", className)}>
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={fullName(selected)} size="xs" />
              <span className="truncate">{fullName(selected)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-border/70 px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ФИО, родитель, телефон или № договора"
            className="h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                onChange(results[active].id);
                setOpen(false);
                setQ("");
              }
            }}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
          {results.length === 0 && <div className="py-8 text-center text-[13px] text-muted-foreground">Никого не нашли. Попробуйте иначе — поиск терпим к опечаткам.</div>}
          {results.map((s, i) => {
            const branch = branchById(state, s.branchId);
            return (
              <button
                key={s.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                  setQ("");
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                  i === active && "bg-accent",
                )}
              >
                <Avatar name={fullName(s)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{fullName(s)}</span>
                    {s.status === "inactive" && (
                      <Badge variant="muted" className="px-1 py-0 text-[10px]">
                        неакт.
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {branch?.shortName} · {s.grade} кл. · {s.parentName.split(" ")[0]} {formatPhone(s.parentPhone)}
                  </span>
                </span>
                {value === s.id && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
