/** Разбор выписки BePaid: CSV «дата;плательщик;сумма;id» */
export interface StatementLine {
  line: number;
  date: string;
  payer: string;
  amount: number;
  extId: string;
}

export function toIso(str: string): string {
  const s = String(str || "").trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? s : "";
}

/** «1 450,50» → 1450.5; NaN при ошибке */
export function parseMoney(str: string): number {
  const s = String(str ?? "").replace(/[\s\u00a0\u202f]/g, "").replace("−", "-").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100) / 100;
}

export function parseStatement(csv: string): { lines: StatementLine[]; bad: number[] } {
  const lines: StatementLine[] = [];
  const bad: number[] = [];
  String(csv || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((ln, i) => {
      const f = ln.split(";").map((x) => x.trim());
      if (i === 0 && !toIso(f[0])) return; // заголовок
      const date = toIso(f[0]);
      const amount = parseMoney(f[2]);
      if (!date || !f[1] || !(amount > 0)) {
        bad.push(i + 1);
        return;
      }
      lines.push({ line: i + 1, date, payer: f[1], amount, extId: f[3] ?? "" });
    });
  return { lines, bad };
}
