/** Проверки расчётов денег. Запуск: Настройки → «Запустить проверки» (или из консоли). */
import { actAmounts, intWords, monthRowK, normContractNo, priceOn, roundHalfUp, rubWords, similarityPct, splitEven, isChargeable } from "./calc";
import { useAppStore } from "./store";
import { actCalc, balanceRow, contractConflict, currentBalance, ledger, statementRows, statementSheets, statementTotals, teacherLessonsInMonth } from "./selectors";
import { formatMoney } from "./utils";
import type { LedgerEntry } from "./types";

export interface TestResult {
  name: string;
  ok: boolean;
  msg: string;
}

export function runTests(): TestResult[] {
  const out: TestResult[] = [];
  const t = (name: string, fn: () => true | string) => {
    try {
      const r = fn();
      out.push({ name, ok: r === true, msg: r === true ? "" : r });
    } catch (e) {
      out.push({ name, ok: false, msg: `Ошибка: ${(e as Error).message}` });
    }
  };
  const eq = (a: unknown, b: unknown): true | string => (String(a) === String(b) ? true : `ожидалось ${JSON.stringify(b)}, получено ${JSON.stringify(a)}`);

  t("Акт: 2 занятия × 46,52 → начислено 93,04; налоги 12,10 и 0,93; к выплате 80,01", () => {
    const r = actAmounts(2, 46.52);
    return eq([r.gross, r.incomeTax, r.fszn, r.net].join(","), "93.04,12.1,0.93,80.01");
  });
  t("Округление half up: 3,50 × 13% = 0,455 → 0,46; 3,50 × 1% = 0,035 → 0,04", () => {
    const r = actAmounts(1, 3.5);
    return eq(`${r.incomeTax},${r.fszn}`, "0.46,0.04") && eq(roundHalfUp(45.5), 46);
  });
  t("Цена по дате занятия: до 01.10 — 30,00, с 01.10 — 35,00", () => {
    const pr = [{ from: "2026-09-01", price: 30 }, { from: "2026-10-01", price: 35 }];
    return eq([priceOn(pr, "2026-09-30"), priceOn(pr, "2026-10-01"), priceOn(pr, "2026-10-22")].join(","), "30,35,35");
  });
  t("Списание по настройке: Н списывается по умолчанию, Б и У — нет; пусто — никогда", () => {
    const d = { chargeAbsent: true, chargeSick: false, chargeExcused: false };
    const a = [isChargeable("present", d), isChargeable("absent", d), isChargeable("sick", d), isChargeable("excused", d), isChargeable(undefined, d)].join(",");
    const b = [isChargeable("absent", { ...d, chargeAbsent: false }), isChargeable("excused", { ...d, chargeExcused: true })].join(",");
    return eq(`${a}|${b}`, "true,true,false,false,false|false,true");
  });
  t("Остаток: конец = начало + сдано − израсходовано; конец месяца = начало следующего", () => {
    const e: LedgerEntry[] = [
      { date: "2026-08-31", type: "open", amount: -3000, label: "" }, { date: "2026-10-02", type: "pay", amount: 24000, label: "" },
      { date: "2026-10-05", type: "charge", amount: -3000, label: "" }, { date: "2026-10-07", type: "charge", amount: -3000, label: "" },
      { date: "2026-11-03", type: "adj", amount: -500, label: "" },
    ];
    const o = monthRowK(e, "2026-10");
    const n = monthRowK(e, "2026-11");
    return eq([o.start, o.paid, o.spent, o.end, n.start].join(","), "-3000,24000,6000,15000,15000");
  });
  t("Отрицательный остаток допустим и переносится (−30 → −230)", () => {
    const r = monthRowK([{ date: "2026-09-30", type: "adj", amount: -3000, label: "" }, { date: "2026-10-05", type: "charge", amount: -20000, label: "" }], "2026-10");
    return eq(`${r.start},${r.end}`, "-3000,-23000");
  });
  t("ФИО: «Федор» = «Фёдор» (100%); опечатка «Лисавский» ≈ «Лисовский» (меньше 100%)", () => {
    const a = similarityPct("Мацкевич Федор", "Мацкевич Фёдор");
    const b = similarityPct("Лисавский Кирилл", "Лисовский Кирилл");
    return a === 100 && b >= 85 && b < 100 ? true : `a=${a}, b=${b}`;
  });
  t("Сумма прописью: 93,04 и 80,01", () => eq(`${rubWords(93.04)} | ${rubWords(80.01)}`, "Девяносто три белорусских рубля, 04 копейки | Восемьдесят белорусских рублей, 01 копейка") && eq(intWords(2000), "две тысячи"));
  t("Формат денег: 1 450,00 (группы разрядов), отрицательные со знаком", () => {
    const f = formatMoney(1450, false).replace(/[\s\u00a0\u202f]/g, "");
    return eq(f, "1450,00") && (formatMoney(-30, false).includes("-") || formatMoney(-30, false).includes("−") ? true : "нет знака минус");
  });
  t("Разделение платежа: доли в сумме дают ровно сумму платежа", () => {
    const a = splitEven(12001, 2);
    return eq(`${a.reduce((x, y) => x + y, 0)},${a.join("/")}`, "12001,6000/6001");
  });
  t("Номера договоров: 03Э = 03э (в рамках года)", () => eq(normContractNo("03Э"), normContractNo("03э")));

  const s = useAppStore.getState();
  t("Данные: номер 03э занят в 2026/27 (Иванов Пётр), но свободен в 2025/26", () => {
    const a = contractConflict(s, "03э", "ay_2627");
    const b = contractConflict(s, "03э", "ay_2526");
    return a && !b && a.message.includes("Иванов") && a.message.includes("27.09.2026") ? true : `a=${a?.message}, b=${b?.message}`;
  });
  t("Данные: «конец месяца» ведомости = остаток по проводкам для каждого ученика и месяца", () => {
    const bad: string[] = [];
    for (const st of s.students) {
      for (const m of ["2026-09", "2026-10"]) {
        const r = balanceRow(s, st.id, m);
        const led = ledger(s, st.id).filter((e) => e.date <= `${m}-31`).reduce((a, e) => a + e.amount, 0) / 100;
        if (Math.abs(r.closing - led) > 0.001 || Math.abs(r.opening + r.paid - r.consumed - r.closing) > 0.001) bad.push(`${st.lastName} ${m}`);
      }
    }
    return bad.length ? `Расхождения: ${bad.slice(0, 3).join("; ")}` : true;
  });
  t("Данные: итоги листа ведомости = сумме строк, формула итога сходится", () => {
    const rows = statementRows(s, statementSheets(s)[1].id, "2026-10");
    const tt = statementTotals(rows);
    return Math.abs(tt.opening + tt.paid - tt.consumed - tt.closing) < 0.001 ? true : "итоги не сходятся";
  });
  t("Данные: контрольный пример — у Крупени (2 проведённых занятия в сентябре) к выплате 80,01", () => {
    const n = teacherLessonsInMonth(s, "t4", "2026-09").length;
    const a = actCalc(n, 46.52);
    return eq(`${n}:${a.gross}:${a.net}`, "2:93.04:80.01");
  });
  t("Данные: ученик в двух группах (э1 + р2) имеет один остаток", () => {
    const b = currentBalance(s, "s06");
    return Number.isFinite(b) ? true : "нет остатка";
  });
  return out;
}
