import type { LucideIcon } from "lucide-react";
import {
  BookOpenCheck, Boxes, CreditCard, FileCheck2, FileSignature, GraduationCap, History, LayoutDashboard, Settings, Users, Wallet,
} from "lucide-react";
import type { Permission } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission;
  shortcut?: string;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    items: [
      { label: "Обзор", href: "/", icon: LayoutDashboard, permission: "dashboard.view", shortcut: "G D" },
      { label: "Ученики", href: "/students", icon: Users, permission: "students.view", shortcut: "G S" },
      { label: "Группы", href: "/groups", icon: Boxes, permission: "groups.view", shortcut: "G G" },
      { label: "Журналы", href: "/journal", icon: BookOpenCheck, permission: "journal.view", shortcut: "G J" },
      { label: "Преподаватели", href: "/teachers", icon: GraduationCap, permission: "teachers.view", shortcut: "G T" },
    ],
  },
  {
    title: "Финансы",
    items: [
      { label: "Ведомости оплат", href: "/statements", icon: Wallet, permission: "finance.view" },
      { label: "Платежи", href: "/payments", icon: CreditCard, permission: "finance.view", shortcut: "G P" },
      { label: "Акты работ", href: "/acts", icon: FileCheck2, permission: "acts.view" },
    ],
  },
  {
    title: "Документы",
    items: [{ label: "Доп. соглашения", href: "/addendums", icon: FileSignature, permission: "documents.view" }],
  },
  {
    title: "Система",
    items: [
      { label: "Настройки", href: "/settings", icon: Settings, permission: "settings.view" },
      { label: "Журнал изменений", href: "/audit", icon: History, permission: "audit.view" },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/": "Обзор",
  "/students": "Ученики и договоры",
  "/groups": "Группы",
  "/journal": "Журналы посещаемости",
  "/teachers": "Преподаватели",
  "/statements": "Ведомости оплат",
  "/payments": "Платежи и сопоставление",
  "/acts": "Акты выполненных работ",
  "/addendums": "Дополнительные соглашения",
  "/settings": "Настройки",
  "/audit": "Журнал изменений",
};
