import type { StudentRow } from "@/lib/rows";
import type { PrintSigner } from "@/components/shared/print-preview";
import { formatDate, formatPhone } from "@/lib/utils";
import { DocHeader, SignatureBlock } from "./common";

export const REGISTRY_COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "ФИО ученика" },
  { key: "status", label: "Статус" },
  { key: "branch", label: "Филиал" },
  { key: "groups", label: "Группы" },
  { key: "grade", label: "Класс" },
  { key: "birthYear", label: "Год рожд." },
  { key: "parent", label: "Законный представитель" },
  { key: "phone", label: "Телефон" },
  { key: "contract", label: "№ договора" },
  { key: "contractDate", label: "Дата договора" },
  { key: "year", label: "Уч. год" },
];

export function RegistryDoc({ rows, columns, signer, subtitle, date }: { rows: StudentRow[]; columns: string[]; signer: PrintSigner; subtitle?: string; date: string }) {
  const cols = REGISTRY_COLUMNS.filter((c) => columns.includes(c.key));
  const cell = (r: StudentRow, key: string) => {
    switch (key) {
      case "name": return r.fullName;
      case "status": return r.status === "active" ? "Активный" : "Неактивный";
      case "branch": return r.branchName;
      case "groups": return r.groupNames.join(", ");
      case "grade": return r.grade;
      case "birthYear": return r.birthYear;
      case "parent": return r.parentName;
      case "phone": return formatPhone(r.parentPhone);
      case "contract": return r.contractNumber;
      case "contractDate": return r.contractDate ? formatDate(r.contractDate) : "";
      case "year": return r.yearLabel;
      default: return "";
    }
  };
  return (
    <div>
      <DocHeader title="Реестр учеников и договоров" subtitle={subtitle} right={<div className="text-right text-[9.5pt]">Сформировано: {formatDate(date)}</div>} />
      <table className="doc">
        <thead>
          <tr>
            <th style={{ width: 28 }}>№</th>
            {cols.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center">{i + 1}</td>
              {cols.map((c) => (
                <td key={c.key} className={["grade", "birthYear", "year", "contractDate"].includes(c.key) ? "text-center whitespace-nowrap" : ""}>
                  {cell(r, c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10pt]">
        Всего учеников: <b>{rows.length}</b>, из них активных: <b>{rows.filter((r) => r.status === "active").length}</b>
      </p>
      <SignatureBlock signer={signer} />
    </div>
  );
}
