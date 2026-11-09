export type Role = "admin" | "teacher" | "accountant";

export type Permission =
  | "dashboard.view"
  | "students.view"
  | "students.edit"
  | "groups.view"
  | "groups.edit"
  | "journal.view"
  | "journal.edit"
  | "teachers.view"
  | "teachers.edit"
  | "teachers.sensitive"
  | "acts.view"
  | "acts.edit"
  | "finance.view"
  | "finance.edit"
  | "documents.view"
  | "documents.edit"
  | "settings.view"
  | "audit.view";

export type EntityStatus = "active" | "inactive";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  teacherId?: string;
}

export interface Branch {
  id: string;
  name: string;
  shortName: string;
  address: string;
  color: string;
}

export interface AcademicYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface PassportData {
  series: string;
  number: string;
  issuedBy: string;
  issuedAt: string;
  personalNumber: string;
}

export interface BankData {
  iban: string;
  bankName: string;
  bic: string;
}

export interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  email: string;
  status: EntityStatus;
  contractNumber: string;
  contractDate: string;
  passport: PassportData;
  bank: BankData;
  address: string;
  rate: number;
  subjects: string[];
}

export type Direction = "electronics" | "robotics" | "it";
export const DIRECTION_LABELS: Record<Direction, string> = {
  electronics: "Юный электронщик",
  robotics: "Робототехника",
  it: "IT-класс",
};

/** Цена занятия действует с даты from (включительно) */
export interface PriceEntry {
  from: string;
  price: number;
}

export interface Group {
  id: string;
  /** Название для печатных форм: «Робототехника №1 группа» */
  name: string;
  /** Короткий код: э1, р2, IT-1 */
  code: string;
  direction: Direction;
  branchId: string;
  teacherId: string;
  academicYearId: string;
  prices: PriceEntry[];
  schedule: string;
  weekdays: number[];
  status: EntityStatus;
  createdAt: string;
}

/** Зачисление: ученик × группа на отрезке дат (to = null — действует) */
export interface Enrollment {
  id: string;
  studentId: string;
  groupId: string;
  from: string;
  to: string | null;
}

export interface Student {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthYear: number;
  /** Класс — строка: «3», «6 лет», «3А(1)» */
  grade: string;
  branchId: string;
  status: EntityStatus;
  parentName: string;
  parentPhone: string;
  parentPhone2?: string;
  notes?: string;
  createdAt: string;
  openingBalance: number;
}

export type ContractStatus = "active" | "closed" | "terminated";

export interface Contract {
  id: string;
  studentId: string;
  number: string;
  academicYearId: string;
  date: string;
  status: ContractStatus;
  closedAt?: string;
}

export interface Lesson {
  id: string;
  groupId: string;
  date: string;
  substituteTeacherId?: string | null;
  /** Занятие не состоялось: ничего не списывает и не идёт в акт */
  cancelled?: boolean;
  topic?: string;
}

export type AttendanceStatus = "present" | "absent" | "sick" | "excused";
export type AttendanceMap = Record<string, AttendanceStatus>;

export type PaymentMethod = "cash" | "card" | "erip" | "bepaid";

export type PaymentStatus = "confirmed" | "pending" | "rejected";

export interface Payment {
  id: string;
  /** null — ученик не определён (платёж на сопоставлении) или платёж разделён */
  studentId: string | null;
  date: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Плательщик по выписке (ФИО как написал родитель) */
  payer?: string;
  /** id операции в выписке BePaid — защита от дублей */
  extId?: string;
  /** Разделение платежа между детьми */
  splits?: { studentId: string; amount: number }[];
  note?: string;
  comment?: string;
  createdBy: string;
}

/** Ручная корректировка остатка (комментарий обязателен) */
export interface Adjustment {
  id: string;
  studentId: string;
  date: string;
  amount: number;
  comment: string;
  createdBy: string;
}

export interface RateEntry {
  from: string;
  rate: number;
}

export interface Settings {
  /** «Сегодня» в демо */
  today: string;
  /** Какие отметки списывают деньги (присутствовал — всегда) */
  chargeAbsent: boolean;
  chargeSick: boolean;
  chargeExcused: boolean;
  incomePct: number;
  fsznPct: number;
  rates: RateEntry[];
  /** Закрытые месяцы (YYYY-MM): журнал, платежи и проводки не редактируются */
  closedMonths: string[];
  /** Дата начального остатка (перенос из Excel) */
  openingDate: string;
}

export interface LedgerEntry {
  date: string;
  type: "open" | "pay" | "adj" | "charge";
  /** Копейки со знаком (списание отрицательное) */
  amount: number;
  label: string;
  ref?: string;
  groupId?: string;
}

export interface Act {
  id: string;
  number: string;
  teacherId: string;
  month: string;
  lessonsCount: number;
  rate: number;
  gross: number;
  incomeTax: number;
  fszn: number;
  net: number;
  signerId: string;
  status: "draft" | "signed";
  source: "journal" | "manual";
  createdAt: string;
}

export interface Signer {
  id: string;
  position: string;
  /** Должность в родительном падеже («в лице специалиста …») */
  positionGen?: string;
  /** Женский род («действующей») */
  female?: boolean;
  name: string;
  isDefault?: boolean;
}

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status"
  | "attendance"
  | "payment"
  | "generate"
  | "membership"
  | "settings";

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  description: string;
}

export interface MembershipChange {
  id: string;
  groupId: string;
  studentId: string;
  type: "added" | "removed";
  at: string;
  by: string;
}

export interface AddendumTemplate {
  id: string;
  title: string;
  clause: string;
  text: string;
}

export interface Addendum {
  id: string;
  contractId: string;
  studentId: string;
  number: string;
  date: string;
  templateId: string;
  clause: string;
  text: string;
  signerId: string;
  createdAt: string;
}

export interface RecentItem {
  type: "student" | "group" | "teacher" | "page";
  id: string;
  label: string;
  href: string;
}
