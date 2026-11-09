import type { PrintSigner } from "@/components/shared/print-preview";
import { monthGenitive } from "@/lib/utils";
import { DocHeader, SignatureBlock } from "./common";

export interface JournalDocRow {
  name: string;
  marks: (string | null)[];
  total: number;
}

export function JournalDoc({
  groupName,
  branchName,
  teacherName,
  schedule,
  month,
  dates,
  rows,
  presentPerLesson,
  substitutes,
  signer,
}: {
  groupName: string;
  branchName: string;
  teacherName: string;
  schedule: string;
  month: string;
  dates: string[];
  rows: JournalDocRow[];
  presentPerLesson: number[];
  substitutes: Record<string, string>;
  signer: PrintSigner;
}) {
  return (
    <div>
      <DocHeader title="Журнал учёта посещаемости занятий" subtitle={`за ${monthGenitive(month)}`} />
      <div className="mb-3 grid grid-cols-2 gap-x-8 gap-y-1 text-[10.5pt]">
        <div><span className="text-neutral-600">Группа:</span> <b>{groupName}</b></div>
        <div><span className="text-neutral-600">Филиал:</span> {branchName}</div>
        <div><span className="text-neutral-600">Преподаватель:</span> {teacherName}</div>
        <div><span className="text-neutral-600">Расписание:</span> {schedule}</div>
      </div>
      <table className="doc" style={{ fontSize: "9.5pt" }}>
        <thead>
          <tr>
            <th style={{ width: 24 }}>№</th>
            <th style={{ textAlign: "left", minWidth: 180 }}>ФИО обучающегося</th>
            {dates.map((d) => (
              <th key={d} style={{ width: 26, padding: "2px 1px" }}>
                {d.slice(8)}
                {substitutes[d] && <sup>*</sup>}
              </th>
            ))}
            <th style={{ width: 44 }}>Итого</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name}>
              <td className="text-center">{i + 1}</td>
              <td>{r.name}</td>
              {r.marks.map((m, j) => (
                <td key={j} className="text-center" style={{ padding: "2px 1px" }}>
                  {m ?? ""}
                </td>
              ))}
              <td className="text-center font-semibold">{r.total}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} className="font-semibold">Присутствовало</td>
            {presentPerLesson.map((n, j) => (
              <td key={j} className="text-center font-semibold" style={{ padding: "2px 1px" }}>{n}</td>
            ))}
            <td className="text-center font-semibold">{presentPerLesson.reduce((a, b) => a + b, 0)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-2 text-[8.5pt] text-neutral-700">
        Обозначения: П — присутствовал, Н — отсутствовал, Б — болел, У — уважительная причина.
        {Object.keys(substitutes).length > 0 && (
          <>
            {" "}* Замена преподавателя:{" "}
            {Object.entries(substitutes).map(([d, n]) => `${d.slice(8)}.${d.slice(5, 7)} — ${n}`).join("; ")}.
          </>
        )}
      </div>
      <SignatureBlock signer={{ position: "Преподаватель", name: teacherName }} secondary={signer} />
    </div>
  );
}
