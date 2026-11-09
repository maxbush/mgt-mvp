import type { StatementRow } from "@/lib/selectors";
import type { PrintSigner } from "@/components/shared/print-preview";
import { formatMoney, fullName, monthGenitive } from "@/lib/utils";
import { DocHeader, SignatureBlock } from "./common";

export function StatementDoc({ rows, branchName, month, signer, accountant }: { rows: StatementRow[]; branchName: string; month: string; signer: PrintSigner; accountant?: PrintSigner }) {
  const sum = (k: "opening" | "paid" | "consumed" | "closing") => rows.reduce((a, r) => a + r[k], 0);
  const m = (v: number) => formatMoney(v, false);
  return (
    <div>
      <DocHeader title="Ведомость учёта оплаты за обучение" subtitle={`${branchName} · за ${monthGenitive(month)}`} />
      <table className="doc">
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: 28 }}>№</th>
            <th rowSpan={2} style={{ textAlign: "left" }}>ФИО обучающегося</th>
            <th rowSpan={2}>Группа</th>
            <th rowSpan={2} style={{ width: 80 }}>Остаток на начало, Br</th>
            <th rowSpan={2} style={{ width: 70 }}>Сдано, Br</th>
            <th colSpan={2}>Израсходовано</th>
            <th rowSpan={2} style={{ width: 80 }}>Остаток на конец, Br</th>
          </tr>
          <tr>
            <th style={{ width: 44 }}>зан.</th>
            <th style={{ width: 70 }}>Br</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.student.id}>
              <td className="text-center">{i + 1}</td>
              <td>{fullName(r.student)}</td>
              <td style={{ fontSize: "9pt" }}>{r.groups.map((g) => g.name).join(", ")}</td>
              <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{m(r.opening)}</td>
              <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{r.paid ? m(r.paid) : ""}</td>
              <td className="text-center">{r.consumedCount || ""}</td>
              <td className="text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{r.consumed ? m(r.consumed) : ""}</td>
              <td className="text-right font-semibold" style={{ fontVariantNumeric: "tabular-nums", color: r.closing < 0 ? "#b00020" : undefined }}>{m(r.closing)}</td>
            </tr>
          ))}
          <tr style={{ background: "#f1f1f1", fontWeight: 600 }}>
            <td colSpan={3}>Итого по филиалу</td>
            <td className="text-right">{m(sum("opening"))}</td>
            <td className="text-right">{m(sum("paid"))}</td>
            <td className="text-center">{rows.reduce((a, r) => a + r.consumedCount, 0)}</td>
            <td className="text-right">{m(sum("consumed"))}</td>
            <td className="text-right">{m(sum("closing"))}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[9pt] text-neutral-700">
        Стоимость занятия установлена на уровне группы. Израсходовано рассчитано по данным журналов посещаемости (отметки «присутствовал» и «отсутствовал без уважительной причины»).
      </p>
      <SignatureBlock signer={signer} secondary={accountant} />
    </div>
  );
}
