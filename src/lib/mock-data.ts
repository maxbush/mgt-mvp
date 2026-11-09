import type {
  AcademicYear, Act, Adjustment, AddendumTemplate, AppUser, AttendanceMap, AttendanceStatus, AuditEntry, Branch, Contract,
  Enrollment, Group, Lesson, MembershipChange, Payment, PaymentMethod, Settings, Signer, Student, Teacher,
} from "./types";
import { actAmounts, isChargeable, priceOn } from "./calc";

/* ------------------------------------------------------------------ */
/*  Демо-данные (синтетические). «Сегодня» — четверг 22.10.2026.        */
/*  Генерация детерминирована: одни и те же данные при каждом сбросе.   */
/* ------------------------------------------------------------------ */
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261022);

export const DEMO_TODAY = "2026-10-22";
export const CURRENT_MONTH = "2026-10";
export const DEFAULT_ACT_RATE = 46.52;
export const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export const DEFAULT_SETTINGS: Settings = {
  today: DEMO_TODAY,
  chargeAbsent: true,
  chargeSick: false,
  chargeExcused: false,
  incomePct: 13,
  fsznPct: 1,
  rates: [{ from: "2026-09-01", rate: DEFAULT_ACT_RATE }],
  closedMonths: ["2026-09"],
  openingDate: "2026-08-31",
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/* ---------- справочники ---------- */
export const USERS: AppUser[] = [
  { id: "u_admin", name: "Карпович Ирина Владимировна", email: "i.karpovich@mgtp.by", role: "admin" },
  { id: "u_t1", name: "Козловский Андрей Петрович", email: "a.kozlovsky@mgtp.by", role: "teacher", teacherId: "t1" },
  { id: "u_acc", name: "Петрова Наталья Сергеевна", email: "n.petrova@mgtp.by", role: "accountant" },
];

export const BRANCHES: Branch[] = [
  { id: "b_kolod", name: "Колодищанская СШ №2", shortName: "Колодищи", address: "Минский р-н, аг. Колодищи, ул. Школьная, д.2", color: "#6366f1" },
  { id: "b_part", name: "Партизанский пр-т, 8", shortName: "Партизанский, 8", address: "г. Минск, Партизанский пр-т, д.8", color: "#10b981" },
  { id: "b_gym32", name: "ГУО Гимназия №32 г. Минска", shortName: "Гимназия 32", address: "г. Минск, ул. Нестерова, д.32", color: "#f59e0b" },
];

export const ACADEMIC_YEARS: AcademicYear[] = [
  { id: "ay_2526", label: "2025/2026", startDate: "2025-09-01", endDate: "2026-05-31", isCurrent: false },
  { id: "ay_2627", label: "2026/2027", startDate: "2026-09-01", endDate: "2027-05-31", isCurrent: true },
];

export const SIGNERS: Signer[] = [
  { id: "sg1", position: "Специалист отдела инновационного развития", positionGen: "специалиста отдела инновационного развития", name: "Орлова А.В.", female: true, isDefault: true },
  { id: "sg2", position: "Заместитель директора по инновационному развитию", positionGen: "заместителя директора по инновационному развитию", name: "Громов А.Л.", female: false },
];

const teacher = (
  id: string, lastName: string, firstName: string, middleName: string, n: number, subjects: string[], status: "active" | "inactive",
  extra: { iban: string; bank: string; bic: string; issuedBy: string },
): Teacher => ({
  id, lastName, firstName, middleName, phone: `+37529555020${n}`, email: `t${n}@example.test`, status,
  contractNumber: n === 2 ? "14/26" : "б/н", contractDate: n === 4 ? "2026-09-10" : "2026-09-01",
  passport: { series: "MP", number: `000${n}${n}0${n}`, issuedBy: extra.issuedBy, issuedAt: `20${18 + n}-0${n + 2}-1${n}`, personalNumber: `000000${n}A00${n}PB${n}` },
  bank: { iban: extra.iban, bankName: extra.bank, bic: extra.bic },
  address: `г. Минск, ул. Условная, д.${n * 7}, кв. ${n * 11}`,
  rate: DEFAULT_ACT_RATE, subjects,
});

export const TEACHERS: Teacher[] = [
  teacher("t1", "Козловский", "Андрей", "Петрович", 1, ["Юный электронщик", "IT-класс"], "active", { iban: "BY11ALFA30140000000000000001", bank: "ЗАО «АЛЬФА-БАНК»", bic: "ALFABY2X", issuedBy: "Партизанским РУВД г. Минска" }),
  teacher("t2", "Мартынова", "Ольга", "Сергеевна", 2, ["Юный электронщик", "Робототехника"], "active", { iban: "BY12ALFA30140000000000000002", bank: "ЗАО «АЛЬФА-БАНК»", bic: "ALFABY2X", issuedBy: "Московским РУВД г. Минска" }),
  teacher("t3", "Шевцов", "Дмитрий", "Игоревич", 3, ["Робототехника"], "active", { iban: "BY13PJCB30140000000000000003", bank: "ОАО «Приорбанк»", bic: "PJCBBY2X", issuedBy: "Заводским РУВД г. Минска" }),
  teacher("t4", "Крупеня", "Игорь", "Валерьевич", 4, ["Юный электронщик"], "inactive", { iban: "BY14ALFA30140000000000000004", bank: "ЗАО «АЛЬФА-БАНК»", bic: "ALFABY2X", issuedBy: "Партизанским РУВД г. Минска" }),
];

/* ---------- группы ---------- */
interface GDef {
  id: string; code: string; name: string; direction: Group["direction"]; branchId: string; teacherId: string;
  prices: Group["prices"]; weekdays: number[]; time: string;
}
const GDEFS: GDef[] = [
  { id: "g_e1", code: "э1", name: "Юный электронщик №1 группа", direction: "electronics", branchId: "b_part", teacherId: "t1", prices: [{ from: "2026-09-01", price: 30 }], weekdays: [1, 3], time: "16:00" },
  { id: "g_e2", code: "э2", name: "Юный электронщик №2 группа", direction: "electronics", branchId: "b_part", teacherId: "t2", prices: [{ from: "2026-09-01", price: 30 }], weekdays: [2, 4], time: "16:30" },
  { id: "g_r1", code: "р1", name: "Робототехника №1 группа", direction: "robotics", branchId: "b_part", teacherId: "t2", prices: [{ from: "2026-09-01", price: 30 }], weekdays: [1, 3], time: "17:30" },
  { id: "g_r2", code: "р2", name: "Робототехника №2 группа", direction: "robotics", branchId: "b_part", teacherId: "t3", prices: [{ from: "2026-09-01", price: 30 }, { from: "2026-10-01", price: 35 }], weekdays: [2, 4], time: "17:30" },
  { id: "g_k1", code: "к1", name: "Робототехника №3 группа", direction: "robotics", branchId: "b_kolod", teacherId: "t3", prices: [{ from: "2026-09-01", price: 30 }], weekdays: [5], time: "15:00" },
  { id: "g_it1", code: "IT-1", name: "IT-класс №1 группа", direction: "it", branchId: "b_kolod", teacherId: "t1", prices: [{ from: "2026-09-01", price: 45 }], weekdays: [2, 4], time: "15:30" },
  { id: "g_g1", code: "Г-1", name: "Юный электронщик №3 группа", direction: "electronics", branchId: "b_gym32", teacherId: "t2", prices: [{ from: "2026-09-01", price: 35 }], weekdays: [5], time: "15:00" },
];
export const GROUPS: Group[] = GDEFS.map((d) => ({
  id: d.id, name: d.name, code: d.code, direction: d.direction, branchId: d.branchId, teacherId: d.teacherId, academicYearId: "ay_2627",
  prices: d.prices, schedule: `${d.weekdays.map((w) => WEEKDAY_SHORT[w]).join(", ")} · ${d.time}`, weekdays: d.weekdays, status: "active", createdAt: "2026-09-01",
}));

/* ---------- ученики, договоры, зачисления ---------- */
type Raw = [string, string, string, number | null, string, string, string, string, [string, (string | null)?, (string | null)?][], boolean?];
const RAW: Raw[] = [
  ["s01", "Адамович", "Глеб", 2017, "3", "Адамович Ольга Николаевна", "01э", "2026-09-02", [["g_e1"]]],
  ["s02", "Мацкевич", "Фёдор", 2018, "2", "Мацкевич Андрей Сергеевич", "02э", "2026-09-02", [["g_e1"]]],
  ["s03", "Иванов", "Пётр", 2015, "4", "Иванова Елена Сергеевна", "03э", "2026-09-27", [["g_e1"]]],
  ["s04", "Лисовский", "Кирилл", 2017, "3А(1)", "Лисовская Наталья Викторовна", "04э", "2026-09-04", [["g_e1"]]],
  ["s05", "Савицкая", "Мария", 2020, "6 лет", "Савицкий Павел Игоревич", "05э", "2026-09-15", [["g_e1", "2026-09-15"]]],
  ["s06", "Кравчук", "Артём", 2014, "5", "Кравчук Татьяна Ивановна", "06э", "2026-09-03", [["g_e1"], ["g_r2"]]],
  ["s07", "Шиманский", "Илья", 2015, "4", "Шиманская Юлия Андреевна", "07э", "2026-09-05", [["g_e2"]]],
  ["s08", "Климович", "Дарья", 2017, "3", "Климович Сергей Олегович", "08э", "2026-09-05", [["g_e2"]]],
  ["s09", "Станкевич", "Егор", 2014, "5", "Станкевич Марина Петровна", "09э", "2026-09-06", [["g_e2"]]],
  ["s10", "Ковалевич", "София", 2018, "2", "Ковалевич Анна Дмитриевна", "10э", "2026-09-06", [["g_e2"]]],
  ["s11", "Дубровский", "Максим", 2016, "3", "Дубровская Ирина Леонидовна", "11э", "2026-09-06", [["g_e2", null, "2026-09-30"], ["g_r1", "2026-10-01"]]],
  ["s12", "Жук", "Владислав", 2015, "4", "Жук Александр Викторович", "01р", "2026-09-03", [["g_r1"]]],
  ["s13", "Лукашевич", "Ангелина", 2017, "3", "Лукашевич Светлана Игоревна", "02р", "2026-09-03", [["g_r1"]]],
  ["s14", "Гуринович", "Тимофей", 2014, "5", "Гуринович Екатерина Юрьевна", "03р", "2026-09-04", [["g_r1"]]],
  ["s15", "Бородич", "Михаил", 2013, "6", "Бородич Дмитрий Александрович", "04р", "2026-09-04", [["g_r2"]]],
  ["s16", "Сидорович", "Никита", 2015, "4", "Сидорович Оксана Васильевна", "05р", "2026-10-05", [["g_r2", "2026-10-05"]]],
  ["s17", "Янковская", "Ева", 2017, "3", "Янковский Игорь Павлович", "06р", "2026-09-07", [["g_r2"]]],
  ["s18", "Романович", "Денис", 2017, "3А(1)", "Романович Алла Николаевна", "07р", "2026-09-08", [["g_k1"]]],
  ["s19", "Пашкевич", "Анна", null, "2", "Пашкевич Виктор Иванович", "08р", "2026-09-08", [["g_k1"]]],
  ["s20", "Войтович", "Артур", 2012, "7", "Войтович Людмила Сергеевна", "01it", "2026-09-09", [["g_it1"]]],
  ["s21", "Борисевич", "Полина", 2013, "6", "Борисевич Роман Анатольевич", "02it", "2026-09-09", [["g_it1"]]],
  ["s22", "Хомич", "Лев", 2011, "8", "Хомич Галина Владимировна", "03it", "2026-09-10", [["g_it1"]]],
  ["s23", "Игнатович", "Вера", 2017, "3", "Игнатович Максим Андреевич", "09-191б", "2026-09-10", [["g_g1"]]],
  ["s24", "Хоменко", "Тимур", 2016, "4", "Хоменко Лариса Петровна", "09-192б", "2026-09-10", [["g_g1"]]],
  ["s25", "Ждан", "Руслан", 2015, "4", "Ждан Николай Степанович", "09-193б", "2026-09-11", [["g_g1", null, "2026-09-25"]], false],
];

export const STUDENTS: Student[] = [];
export const CONTRACTS: Contract[] = [];
export const ENROLLMENTS: Enrollment[] = [];
export const MEMBERSHIP: MembershipChange[] = [];

const groupBranch = (gid: string) => GDEFS.find((g) => g.id === gid)!.branchId;
RAW.forEach((r, i) => {
  const [id, lastName, firstName, birthYear, grade, parentName, no, cdate, enr, active] = r;
  STUDENTS.push({
    id, lastName, firstName, middleName: "", birthYear: birthYear ?? 0, grade, branchId: groupBranch(enr[0][0]), status: active === false ? "inactive" : "active",
    parentName, parentPhone: `+3752955501${String(i + 1).padStart(2, "0")}`, createdAt: cdate, openingBalance: 0,
  });
  CONTRACTS.push({ id: `c_${id}`, studentId: id, number: no, academicYearId: "ay_2627", date: cdate, status: active === false ? "terminated" : "active", closedAt: active === false ? "2026-09-25" : undefined });
  if (id === "s07") CONTRACTS.push({ id: "c_s07_old", studentId: id, number: "12э", academicYearId: "ay_2526", date: "2025-09-20", status: "closed", closedAt: "2026-05-31" });
  enr.forEach((e, k) => {
    const from = e[1] ?? "2026-09-07";
    const to = e[2] ?? null;
    ENROLLMENTS.push({ id: `e_${id}_${k}`, studentId: id, groupId: e[0], from, to });
    MEMBERSHIP.push({ id: `m_${id}_${k}_a`, groupId: e[0], studentId: id, type: "added", at: `${from}T10:00:00`, by: "Карпович И. В." });
    if (to) MEMBERSHIP.push({ id: `m_${id}_${k}_r`, groupId: e[0], studentId: id, type: "removed", at: `${to}T18:00:00`, by: "Карпович И. В." });
  });
});
// фамилия Пашкевич — год рождения не указан (может быть пустым): 0 = пусто
const enrolledOn = (gid: string, d: string) => ENROLLMENTS.filter((e) => e.groupId === gid && e.from <= d && (!e.to || e.to >= d)).map((e) => e.studentId);

/* ---------- занятия и отметки: 07.09 – 31.10 ---------- */
export const LESSONS: Lesson[] = [];
export const ATTENDANCE: AttendanceMap = {};
const UNMARKED = new Set(["g_r1|2026-10-21", "g_g1|2026-10-16"]);
for (const g of GDEFS) {
  for (let d = "2026-09-07"; d <= "2026-10-31"; d = addDays(d, 1)) {
    if (!g.weekdays.includes(dow(d))) continue;
    const key = `${g.id}|${d}`;
    const l: Lesson = { id: `l_${g.id}_${d}`, groupId: g.id, date: d, substituteTeacherId: null };
    if (key === "g_e2|2026-10-08") l.cancelled = true;
    else if (d <= DEMO_TODAY && !UNMARKED.has(key)) {
      for (const sid of enrolledOn(g.id, d)) {
        const x = rand();
        if (x < 0.03) continue;
        const st: AttendanceStatus = x < 0.82 ? "present" : x < 0.9 ? "absent" : x < 0.95 ? "sick" : "excused";
        ATTENDANCE[`${l.id}|${sid}`] = st;
      }
    }
    if (key === "g_e2|2026-09-15" || key === "g_e2|2026-09-17") l.substituteTeacherId = "t4";
    if (key === "g_e2|2026-10-15") l.substituteTeacherId = "t1";
    LESSONS.push(l);
  }
}

/* ---------- платежи: суммы подобраны так, чтобы остатки попали в «целевые» ---------- */
const TARGETS: Record<string, [number, number, number | null]> = {
  s01: [60, 90, 120], s02: [0, 60, 30], s03: [0, -30, 30], s04: [30, 60, 0], s05: [0, 120, 90], s06: [120, 90, 180], s07: [0, 30, 60],
  s08: [0, 0, 30], s09: [-60, 0, 60], s10: [30, 30, 90], s11: [0, 60, 90], s12: [0, -30, null], s13: [60, 90, 60], s14: [0, 30, 0],
  s15: [30, 60, 120], s16: [0, 30, 30], s17: [90, 60, 90], s18: [0, 30, 60], s19: [30, 0, null], s20: [135, 180, 225], s21: [0, 90, 45],
  s22: [90, 135, 180], s23: [0, 70, 105], s24: [35, 35, 0], s25: [0, -60, -60],
};
const spent = (sid: string, month: string) => {
  let t = 0;
  for (const l of LESSONS) {
    if (l.cancelled || !l.date.startsWith(month)) continue;
    const st = ATTENDANCE[`${l.id}|${sid}`];
    if (!isChargeable(st, DEFAULT_SETTINGS)) continue;
    t += priceOn(GROUPS.find((g) => g.id === l.groupId)!.prices, l.date);
  }
  return t;
};
export const PAYMENTS: Payment[] = [];
let nPay = 0;
STUDENTS.forEach((s, i) => {
  const [o, e9, e10] = TARGETS[s.id];
  s.openingBalance = o;
  const mk = (date: string, amount: number) => {
    nPay += 1;
    const manual = i % 4 === 0;
    const method: PaymentMethod = manual ? "cash" : i % 3 === 0 ? "erip" : "bepaid";
    const payer = manual || i % 5 === 1 ? s.parentName : `${s.lastName} ${s.firstName}`;
    PAYMENTS.push({
      id: `p${String(nPay).padStart(3, "0")}`, studentId: s.id, date, amount: amount, method, status: "confirmed", payer,
      extId: manual ? undefined : `BP-${100200 + nPay * 3}`, createdBy: "Петрова Н. С.",
    });
  };
  const a9 = e9 - o + spent(s.id, "2026-09");
  if (a9 > 0) mk(`2026-09-0${2 + (i % 6)}`, a9);
  if (e10 != null) {
    const a10 = e10 - e9 + spent(s.id, "2026-10");
    if (a10 > 0) mk(`2026-10-0${1 + (i % 3)}`, a10);
  }
});
{
  const dup = PAYMENTS.find((p) => p.method === "bepaid" && p.date.startsWith("2026-10"));
  if (dup) dup.extId = "BP-100231";
}
PAYMENTS.push(
  { id: "pp1", studentId: null, date: "2026-10-20", amount: 60, method: "bepaid", status: "pending", payer: "Лисавский Кирилл", extId: "BP-100401", createdBy: "BePaid" },
  { id: "pp2", studentId: null, date: "2026-10-21", amount: 120, method: "bepaid", status: "pending", payer: "Иванова Елена", extId: "BP-100402", createdBy: "BePaid" },
  { id: "pp3", studentId: null, date: "2026-10-19", amount: 120, method: "bepaid", status: "pending", payer: "Гуринович Тимофей и Бородич Михаил", extId: "BP-100403", createdBy: "BePaid" },
  { id: "pr1", studentId: null, date: "2026-10-12", amount: 15, method: "bepaid", status: "rejected", payer: "Петровский Игорь", extId: "BP-100390", note: "Плательщик не связан с учениками", createdBy: "BePaid" },
);

export const ADJUSTMENTS: Adjustment[] = [
  { id: "adj1", studentId: "s13", date: "2026-10-10", amount: 15, comment: "Перерасчёт: возврат за пропущенное занятие (сентябрь)", createdBy: "Петрова Н. С." },
];

/** Демо-выписка BePaid: 8 строк (5 сопоставятся сами, 2 в очередь, 1 дубль id) */
export const DEMO_STATEMENT_CSV = [
  "22.10.2026;Савицкая Мария;120,00;BP-200001",
  "22.10.2026;Станкевич Егор;90,00;BP-200002",
  "21.10.2026;Адомович Глеб;60,00;BP-200003",
  "21.10.2026;Мацкевич Федор;60,00;BP-200004",
  "21.10.2026;Петрашкевич Олег;45,00;BP-200005",
  "20.10.2026;Войтович Артур;135,00;BP-200006",
  "20.10.2026;Климович Дарья;60,00;BP-100231",
  "19.10.2026;Хомич Лев;90,00;BP-200008",
].join("\n");

/* ---------- акты за закрытый сентябрь ---------- */
export const ACTS: Act[] = [];
{
  let n = 1;
  for (const t of TEACHERS) {
    const count = LESSONS.filter((l) => {
      if (!l.date.startsWith("2026-09") || l.cancelled) return false;
      const marked = Object.keys(ATTENDANCE).some((k) => k.startsWith(`${l.id}|`));
      if (!marked) return false;
      const g = GROUPS.find((x) => x.id === l.groupId)!;
      return (l.substituteTeacherId ?? g.teacherId) === t.id;
    }).length;
    if (!count) continue;
    ACTS.push({
      id: `act_2609_${t.id}`, number: `${String(n++).padStart(2, "0")}/09-26`, teacherId: t.id, month: "2026-09", lessonsCount: count, rate: DEFAULT_ACT_RATE,
      ...actAmounts(count, DEFAULT_ACT_RATE), signerId: "sg1", status: "signed", source: "journal", createdAt: "2026-09-30T16:20:00",
    });
  }
}

/* ---------- шаблоны доп. соглашений ---------- */
export const ADDENDUM_TEMPLATES: AddendumTemplate[] = [
  { id: "tpl_price", title: "Изменение стоимости занятий", clause: "Пункт 3.1 договора", text: "Стоимость одного учебного занятия составляет {{price}} ({{priceWords}}). Новая стоимость применяется к занятиям, проведённым начиная с {{date}}." },
  { id: "tpl_group", title: "Перевод в другую группу", clause: "Пункт 1.2 договора", text: "Обучение {{studentName}} осуществляется в группе «{{group}}» по адресу: {{branch}}, в соответствии с расписанием Исполнителя начиная с {{date}}." },
  { id: "tpl_term", title: "Продление срока действия договора", clause: "Пункт 6.1 договора", text: "Срок действия договора № {{contractNumber}} от {{contractDate}} продлевается до {{date}} включительно." },
  { id: "tpl_parent", title: "Изменение данных представителя", clause: "Раздел «Реквизиты сторон»", text: "Реквизиты Заказчика изложить в следующей редакции: {{parentName}}, контактный телефон {{parentPhone}}." },
];

/* ---------- журнал изменений ---------- */
const T0 = new Date(2026, 9, 22, 17, 42);
const auditSeed: Omit<AuditEntry, "id" | "at">[] = [
  { userId: "u_t1", userName: "Козловский А. П.", action: "attendance", entity: "journal", entityId: "g_e1", description: "Отметил посещаемость: Юный электронщик №1 группа, 21.10.2026" },
  { userId: "u_acc", userName: "Петрова Н. С.", action: "payment", entity: "student", entityId: "s13", description: "Внесена корректировка +15,00 BYN — Лукашевич Ангелина" },
  { userId: "u_admin", userName: "Карпович И. В.", action: "create", entity: "student", entityId: "s16", description: "Создан ученик Сидорович Никита, договор 05р" },
  { userId: "u_admin", userName: "Карпович И. В.", action: "membership", entity: "group", entityId: "g_r1", description: "Перевод: Дубровский М. — из э2 в р1 с 01.10.2026" },
  { userId: "u_admin", userName: "Карпович И. В.", action: "update", entity: "lesson", entityId: "g_e2", description: "Замена преподавателя на занятии 15.10.2026 — Козловский А. П." },
  { userId: "u_acc", userName: "Петрова Н. С.", action: "generate", entity: "acts", entityId: "2026-09", description: "Сформированы акты за сентябрь 2026 (4 шт.)" },
  { userId: "u_admin", userName: "Карпович И. В.", action: "settings", entity: "settings", entityId: "closedMonths", description: "Месяц «Сентябрь 2026» закрыт" },
  { userId: "u_admin", userName: "Карпович И. В.", action: "update", entity: "group", entityId: "g_r2", description: "Цена занятия р2: 30,00 → 35,00 BYN с 01.10.2026" },
];
export const AUDIT: AuditEntry[] = auditSeed.map((e, i) => ({ ...e, id: `a${i}`, at: new Date(T0.getTime() - i * 3.3 * 3600 * 1000).toISOString() }));
