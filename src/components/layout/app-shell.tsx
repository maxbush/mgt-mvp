import * as React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import {
  Bell, Check, Command as CommandIcon, Laptop, LogOut, Menu, Moon, Search, ShieldCheck, Sun, BookOpenCheck, Keyboard,
} from "lucide-react";
import { useAppStore, useCurrentUser, type Theme } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Sheet, SheetContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TooltipProvider, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/popover";
import { SidebarContent } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { PAGE_TITLES } from "./nav";

/* ---------- Theme ---------- */
export function useTheme() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [resolved, setResolved] = React.useState<"light" | "dark">(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
      setResolved(dark ? "dark" : "light");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return { theme, setTheme, resolved };
}

function ThemeToggle() {
  const { theme, setTheme, resolved } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Тема">
          {resolved === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light"><Sun className="mr-2 size-4" /> Светлая</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="mr-2 size-4" /> Тёмная</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Laptop className="mr-2 size-4" /> Системная</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- Notifications ---------- */
function Notifications() {
  const audit = useAppStore((s) => s.audit);
  const navigate = useNavigate();
  const items = audit.slice(0, 6);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Уведомления" className="relative">
          <Bell className="size-4" />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary ring-2 ring-background" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Последние изменения
          <button onClick={() => navigate("/audit")} className="text-[11px] font-normal normal-case tracking-normal text-primary hover:underline">
            Все
          </button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((a) => (
          <DropdownMenuItem key={a.id} className="flex-col items-start gap-0.5 py-2" onClick={() => navigate("/audit")}>
            <span className="line-clamp-2 text-[12.5px] leading-snug">{a.description}</span>
            <span className="text-[11px] text-muted-foreground">
              {a.userName} · {formatDateTime(a.at)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- User menu ---------- */
function UserMenu() {
  const user = useCurrentUser();
  const role = useAppStore((s) => s.role);
  const teacherId = useAppStore((s) => s.teacherId);
  const teachers = useAppStore((s) => s.teachers);
  const setRole = useAppStore((s) => s.setRole);
  const dataMode = useAppStore((s) => s.dataMode);
  const logout = useAppStore((s) => s.logout);
  const setDataMode = useAppStore((s) => s.setDataMode);
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
          <Avatar name={user.name} size="md" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{user.name}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <DropdownMenuSeparator />
        {dataMode === "demo" && (
          <>
            <DropdownMenuLabel>Демо: переключить роль</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={role === "teacher" ? `teacher:${teacherId}` : role}
              onValueChange={(v) => {
                if (v.startsWith("teacher:")) setRole("teacher", v.slice(8));
                else setRole(v as Role);
                navigate(v.startsWith("teacher:") ? "/journal" : "/");
              }}
            >
              {(["admin", "accountant"] as Role[]).map((r) => (
                <DropdownMenuRadioItem key={r} value={r}>
                  <ShieldCheck className="mr-2 size-4 text-muted-foreground" />
                  {ROLE_LABELS[r]}
                </DropdownMenuRadioItem>
              ))}
              {teachers.filter((t) => t.status === "active").map((t) => (
                <DropdownMenuRadioItem key={t.id} value={`teacher:${t.id}`}>
                  <ShieldCheck className="mr-2 size-4 text-muted-foreground" />
                  Преподаватель · {t.lastName} {t.firstName[0]}.{t.middleName ? `${t.middleName[0]}.` : ""}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        {dataMode === "api" ? (
          <DropdownMenuItem onClick={() => void logout()}>
            <LogOut /> Выйти
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => void setDataMode("api")}>
            <LogOut /> Подключить к серверу…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- Onboarding ---------- */
function Onboarding() {
  const done = useAppStore((s) => s.onboardingDone);
  const setDone = useAppStore((s) => s.setOnboardingDone);
  const [step, setStep] = React.useState(0);
  const steps = [
    { icon: <Search className="size-5" />, title: "Быстрый поиск ⌘K", text: "Нажмите Ctrl/⌘ + K в любом месте: ученики, телефоны, договоры, группы и быстрые действия — всё в одной строке." },
    { icon: <BookOpenCheck className="size-5" />, title: "Журнал — одним касанием", text: "В журнале посещаемости клик по ячейке переключает статус: Присутствовал → Отсутствовал → Болел → Ув. Работает с клавиатуры (стрелки + 1–4)." },
    { icon: <Keyboard className="size-5" />, title: "Всё связано", text: "Ученик → договор → группа → посещаемость → остаток → акт. Данные вводятся один раз, печатные формы собираются автоматически." },
  ];
  const s = steps[step];
  return (
    <Dialog open={!done} onOpenChange={(o) => !o && setDone()}>
      <DialogContent size="sm" hideClose>
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{s.icon}</div>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">{s.text}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-primary" : "w-1.5 bg-border")} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={setDone}>
              Пропустить
            </Button>
            <Button size="sm" onClick={() => (step < steps.length - 1 ? setStep(step + 1) : setDone())}>
              {step < steps.length - 1 ? "Далее" : "Начать работу"} <Check className="size-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Shell ---------- */
export function AppShell() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { resolved } = useTheme();

  // Global hotkeys: ⌘K, G+D/S/G/J/T navigation chords
  React.useEffect(() => {
    let chord: string | null = null;
    let chordTimer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (chord === "g") {
        const map: Record<string, string> = { d: "/", s: "/students", g: "/groups", j: "/journal", t: "/teachers" };
        const href = map[e.key.toLowerCase()];
        if (href) navigate(href);
        chord = null;
        return;
      }
      if (e.key.toLowerCase() === "g") {
        chord = "g";
        window.clearTimeout(chordTimer);
        chordTimer = window.setTimeout(() => (chord = null), 900);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const base = "/" + (location.pathname.split("/")[1] ?? "");
  const title = PAGE_TITLES[base] ?? "";

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-dvh bg-background">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block",
            collapsed ? "w-[60px]" : "w-60",
          )}
        >
          <SidebarContent collapsed={collapsed} />
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar p-0">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/70 px-3 glass sm:px-5">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Меню">
              <Menu className="size-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[14px] font-semibold tracking-tight">{title}</h2>
            </div>
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden h-8 w-64 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[12.5px] text-muted-foreground shadow-soft transition-colors hover:bg-accent md:flex"
            >
              <Search className="size-3.5" />
              <span className="flex-1 text-left">Поиск…</span>
              <Kbd>
                <CommandIcon className="size-2.5" />K
              </Kbd>
            </button>
            <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setCmdOpen(true)} aria-label="Поиск">
              <Search className="size-4" />
            </Button>
            <Notifications />
            <ThemeToggle />
            <UserMenu />
          </header>

          {/* Page */}
          <main className="flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="mx-auto w-full max-w-[1600px]"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <Onboarding />
      <Toaster richColors position="bottom-right" theme={resolved} toastOptions={{ className: "text-[13px]" }} closeButton />
    </TooltipProvider>
  );
}
