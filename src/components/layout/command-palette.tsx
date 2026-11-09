import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpenCheck, Boxes, Clock, FileCheck2, GraduationCap, Moon, Sun, UserPlus, Users, Wallet, ShieldCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { can, ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { formatPhone, fullName, shortName } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Avatar } from "@/components/ui/misc";
import { NAV } from "./nav";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { students, groups, teachers, branches, role, recent, theme, setTheme, setRole, pushRecent } = useAppStore();
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  const showData = can(role, "students.view");
  const visibleGroups = role === "teacher" ? groups.filter((g) => g.teacherId === "t1") : groups;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose size="lg" className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 glass">
        <Command
          shouldFilter={true}
          filter={(value, search, keywords) => {
            const hay = `${value} ${(keywords ?? []).join(" ")}`.toLowerCase();
            const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
            if (!terms.length) return 1;
            return terms.every((t) => hay.includes(t)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Поиск учеников, групп, договоров, телефонов или команд…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>Ничего не найдено</CommandEmpty>

            {!q && recent.length > 0 && (
              <CommandGroup heading="Недавние">
                {recent.slice(0, 5).map((r) => (
                  <CommandItem key={`${r.type}-${r.id}`} value={`recent-${r.id}-${r.label}`} onSelect={() => go(r.href)}>
                    <Clock /> {r.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading="Навигация">
              {NAV.flatMap((s) => s.items)
                .filter((i) => can(role, i.permission))
                .map((i) => (
                  <CommandItem key={i.href} value={`nav ${i.label}`} onSelect={() => go(i.href)}>
                    <i.icon /> {i.label}
                    {i.shortcut && <CommandShortcut>{i.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="Действия">
              {can(role, "students.edit") && (
                <CommandItem value="action добавить ученика новый" onSelect={() => go("/students?new=1")}>
                  <UserPlus /> Добавить ученика
                </CommandItem>
              )}
              {can(role, "finance.edit") && (
                <CommandItem value="action внести оплату платёж" onSelect={() => go("/statements?pay=1")}>
                  <Wallet /> Внести оплату
                </CommandItem>
              )}
              <CommandItem value="action открыть журнал посещаемости" onSelect={() => go("/journal")}>
                <BookOpenCheck /> Открыть журнал посещаемости
              </CommandItem>
              {can(role, "acts.edit") && (
                <CommandItem value="action сформировать акты" onSelect={() => go("/acts?generate=1")}>
                  <FileCheck2 /> Сформировать акты за месяц
                </CommandItem>
              )}
              <CommandItem
                value="action переключить тему тёмная светлая"
                onSelect={() => {
                  const isDark = document.documentElement.classList.contains("dark");
                  setTheme(isDark ? "light" : "dark");
                  onOpenChange(false);
                }}
              >
                {theme === "dark" ? <Sun /> : <Moon />} Переключить тему
              </CommandItem>
              {(["admin", "teacher", "accountant"] as Role[])
                .filter((r) => r !== role)
                .map((r) => (
                  <CommandItem
                    key={r}
                    value={`action роль ${ROLE_LABELS[r]}`}
                    onSelect={() => {
                      setRole(r);
                      onOpenChange(false);
                      navigate("/");
                    }}
                  >
                    <ShieldCheck /> Войти как: {ROLE_LABELS[r]}
                  </CommandItem>
                ))}
            </CommandGroup>

            {showData && q.length >= 2 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Ученики">
                  {students.slice(0, 400).map((s) => {
                    const b = branches.find((x) => x.id === s.branchId);
                    return (
                      <CommandItem
                        key={s.id}
                        value={`student ${fullName(s)} ${s.parentName}`}
                        keywords={[s.parentPhone, formatPhone(s.parentPhone), `${s.grade} кл`, b?.shortName ?? ""]}
                        onSelect={() => {
                          pushRecent({ type: "student", id: s.id, label: fullName(s), href: `/students/${s.id}` });
                          go(`/students/${s.id}`);
                        }}
                      >
                        <Avatar name={fullName(s)} size="xs" />
                        <span className="truncate">{fullName(s)}</span>
                        <span className="ml-auto truncate text-[11.5px] text-muted-foreground">
                          {b?.shortName} · {s.grade} кл.
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {q.length >= 2 && (
              <CommandGroup heading="Группы">
                {visibleGroups.map((g) => {
                  const t = teachers.find((x) => x.id === g.teacherId);
                  const b = branches.find((x) => x.id === g.branchId);
                  return (
                    <CommandItem
                      key={g.id}
                      value={`group ${g.name} ${b?.name ?? ""} ${t ? shortName(t) : ""}`}
                      onSelect={() => {
                        pushRecent({ type: "group", id: g.id, label: g.name, href: `/groups/${g.id}` });
                        go(`/groups/${g.id}`);
                      }}
                    >
                      <Boxes />
                      <span className="truncate">{g.name}</span>
                      <span className="ml-auto truncate text-[11.5px] text-muted-foreground">{b?.shortName}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {can(role, "teachers.view") && q.length >= 2 && (
              <CommandGroup heading="Преподаватели">
                {teachers.map((t) => (
                  <CommandItem key={t.id} value={`teacher ${fullName(t)}`} keywords={[t.phone]} onSelect={() => go(`/teachers?focus=${t.id}`)}>
                    <GraduationCap />
                    <span className="truncate">{fullName(t)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showData && q.length < 2 && (
              <div className="px-3 py-2 text-[11.5px] text-muted-foreground">
                <Users className="mr-1 inline size-3.5" />
                Введите 2+ символа для поиска по ученикам, группам и преподавателям
              </div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
