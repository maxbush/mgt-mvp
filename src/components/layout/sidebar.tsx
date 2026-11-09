import { NavLink, useLocation } from "react-router-dom";
import { Cpu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/popover";
import { NAV } from "./nav";

export function SidebarContent({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const role = useAppStore((s) => s.role);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const location = useLocation();

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={cn("flex h-14 items-center gap-2.5 px-3", collapsed && "justify-center px-0")}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.2)]">
          <Cpu className="size-4" strokeWidth={2} />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold tracking-tight">Инженерная школа</div>
            <div className="truncate text-[10.5px] text-muted-foreground">Минский городской технопарк</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 no-scrollbar">
        {NAV.map((section, si) => {
          const items = section.items.filter((i) => can(role, i.permission));
          if (!items.length) return null;
          return (
            <div key={si} className={cn("mb-3", si > 0 && "mt-1")}>
              {section.title && !collapsed && (
                <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">{section.title}</div>
              )}
              {section.title && collapsed && <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />}
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.href);
                  const link = (
                    <NavLink
                      to={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors",
                        "hover:bg-sidebar-accent hover:text-foreground",
                        active && "bg-sidebar-accent text-foreground shadow-soft",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      {active && <span className="absolute -left-2 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
                      <item.icon className={cn("size-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={1.75} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip content={item.label} side="right">
                          {link}
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-sidebar-border p-2", collapsed && "flex justify-center")}>
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">Роль</div>
              <div className="truncate text-[12.5px] font-medium">{ROLE_LABELS[role]}</div>
            </div>
            <button
              onClick={toggle}
              className="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground lg:block"
              aria-label="Свернуть меню"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
        ) : (
          <Tooltip content="Развернуть меню" side="right">
            <button onClick={toggle} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground" aria-label="Развернуть меню">
              <PanelLeftOpen className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
