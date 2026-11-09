import type { Act, Teacher } from "@/lib/types";
import type { PrintSigner } from "@/components/shared/print-preview";
import { formatDate, formatMoney, fullName, monthGenitive, shortName } from "@/lib/utils";
import { ORG, dateLong, moneyToWords } from "./common";

export function ActDoc({ act, teacher, signer, date }: { act: Act; teacher: Teacher; signer: PrintSigner; date: string }) {
  const m = (v: number) => formatMoney(v, false);
  return (
    <div className="text-[11pt] leading-[1.45]">
      <h1 className="text-center text-[13pt] font-bold uppercase">Акт сдачи-приёмки выполненных работ № {act.number}</h1>
      <p className="mt-1 text-center">по договору подряда № {teacher.contractNumber} от {formatDate(teacher.contractDate)}</p>
      <div className="mt-4 flex justify-between">
        <span>г. Минск</span>
        <span>{dateLong(date)}</span>
      </div>
      <p className="mt-4 text-justify indent-8">
        <b>{ORG.name}</b>, именуемый в дальнейшем «Заказчик», в лице {signer.position.toLowerCase()}а {signer.name}, с одной стороны, и гражданин(ка){" "}
        <b>{fullName(teacher)}</b>, паспорт {teacher.passport.series} {teacher.passport.number}, выдан {formatDate(teacher.passport.issuedAt)} {teacher.passport.issuedBy}, личный номер {teacher.passport.personalNumber}, проживающий(ая) по адресу: {teacher.address}, именуемый(ая) в дальнейшем «Исполнитель», с другой стороны, составили настоящий акт о нижеследующем:
      </p>
      <p className="mt-2 text-justify indent-8">
        1. Исполнитель выполнил, а Заказчик принял следующие работы за {monthGenitive(act.month)}:
      </p>
      <table className="doc mt-2">
        <thead>
          <tr>
            <th style={{ width: 28 }}>№</th>
            <th>Наименование работ (услуг)</th>
            <th style={{ width: 70 }}>Кол-во, час.</th>
            <th style={{ width: 90 }}>Цена, Br</th>
            <th style={{ width: 100 }}>Сумма, Br</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-center">1</td>
            <td>Проведение учебных занятий в Инженерной школе ({teacher.subjects.join(", ")}) согласно журналам посещаемости</td>
            <td className="text-center">{act.lessonsCount}</td>
            <td className="text-right">{m(act.rate)}</td>
            <td className="text-right">{m(act.gross)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="text-right font-semibold">Итого начислено</td>
            <td className="text-right font-semibold">{m(act.gross)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="text-right">Удержан подоходный налог (13%)</td>
            <td className="text-right">{m(act.incomeTax)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="text-right">Удержан взнос в ФСЗН (1%)</td>
            <td className="text-right">{m(act.fszn)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="text-right font-bold">К выплате</td>
            <td className="text-right font-bold">{m(act.net)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-justify">
        2. Общая стоимость выполненных работ составляет <b>{m(act.gross)}</b> ({moneyToWords(act.gross)}). К выплате Исполнителю после удержаний: <b>{m(act.net)}</b> ({moneyToWords(act.net)}).
      </p>
      <p className="mt-1 text-justify">3. Работы выполнены в полном объёме, в установленные сроки и с надлежащим качеством. Стороны претензий друг к другу не имеют.</p>
      <p className="mt-1 text-justify">
        4. Оплата производится путём перечисления на счёт Исполнителя: {teacher.bank.iban}, {teacher.bank.bankName}, BIC {teacher.bank.bic}.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-10 break-inside-avoid">
        <div>
          <div className="font-semibold">Заказчик</div>
          <div className="mt-1">{ORG.name}</div>
          <div className="text-[9.5pt]">{ORG.address}, УНП {ORG.unp}</div>
          <div className="mt-8 flex items-end gap-2">
            <span>{signer.position}</span>
            <span className="w-28 flex-1 border-b border-black" />
            <span>{signer.name.split(" ").map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ")}</span>
          </div>
          <div className="mt-1 text-[8.5pt]">М.П.</div>
        </div>
        <div>
          <div className="font-semibold">Исполнитель</div>
          <div className="mt-1">{fullName(teacher)}</div>
          <div className="text-[9.5pt]">{teacher.address}</div>
          <div className="mt-8 flex items-end gap-2">
            <span className="w-28 flex-1 border-b border-black" />
            <span>{shortName(teacher)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
