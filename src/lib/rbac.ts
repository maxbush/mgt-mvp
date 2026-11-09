import type { Permission, Role } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Администратор",
  teacher: "Преподаватель",
  accountant: "Бухгалтер",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Полный доступ ко всем разделам, настройкам и документам",
  teacher: "Только свои группы: журналы посещаемости и контакты родителей",
  accountant: "Финансы: ведомости, акты, оплаты, реестр (только чтение)",
};

export const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: "dashboard.view", label: "Обзор", group: "Общее" },
  { key: "students.view", label: "Просмотр реестра учеников", group: "Ученики" },
  { key: "students.edit", label: "Редактирование учеников и договоров", group: "Ученики" },
  { key: "groups.view", label: "Просмотр групп", group: "Группы" },
  { key: "groups.edit", label: "Управление составом групп", group: "Группы" },
  { key: "journal.view", label: "Просмотр журналов", group: "Журналы" },
  { key: "journal.edit", label: "Отметки посещаемости", group: "Журналы" },
  { key: "teachers.view", label: "Просмотр преподавателей", group: "Преподаватели" },
  { key: "teachers.edit", label: "Редактирование преподавателей", group: "Преподаватели" },
  { key: "teachers.sensitive", label: "Паспортные и банковские данные", group: "Преподаватели" },
  { key: "acts.view", label: "Просмотр актов", group: "Финансы" },
  { key: "acts.edit", label: "Формирование актов", group: "Финансы" },
  { key: "finance.view", label: "Просмотр ведомостей", group: "Финансы" },
  { key: "finance.edit", label: "Внесение оплат", group: "Финансы" },
  { key: "documents.view", label: "Просмотр документов", group: "Документы" },
  { key: "documents.edit", label: "Создание доп. соглашений", group: "Документы" },
  { key: "settings.view", label: "Настройки системы", group: "Система" },
  { key: "audit.view", label: "Журнал изменений", group: "Система" },
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS.map((p) => p.key),
  teacher: ["dashboard.view", "groups.view", "journal.view", "journal.edit"],
  accountant: [
    "dashboard.view",
    "students.view",
    "groups.view",
    "teachers.view",
    "teachers.sensitive",
    "acts.view",
    "acts.edit",
    "finance.view",
    "finance.edit",
    "documents.view",
    "audit.view",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
