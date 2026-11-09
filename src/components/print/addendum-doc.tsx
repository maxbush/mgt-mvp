import type { PrintSigner } from "@/components/shared/print-preview";
import { formatDate, formatPhone } from "@/lib/utils";
import { ORG, dateLong } from "./common";

export interface AddendumDocProps {
  number: string;
  date: string;
  contractNumber: string;
  contractDate: string;
  studentName: string;
  birthYear: number;
  parentName: string;
  parentPhone: string;
  clause: string;
  text: string;
  signer: PrintSigner;
}

export function AddendumDoc(p: AddendumDocProps) {
  return (
    <div className="text-[11pt] leading-[1.5]">
      <h1 className="text-center text-[13pt] font-bold uppercase">Дополнительное соглашение № {p.number}</h1>
      <p className="text-center">к Договору об оказании платных образовательных услуг № {p.contractNumber} от {formatDate(p.contractDate)}</p>
      <div className="mt-4 flex justify-between">
        <span>г. Минск</span>
        <span>{dateLong(p.date)}</span>
      </div>
      <p className="mt-4 text-justify indent-8">
        <b>{ORG.name}</b> ({ORG.unit}), именуемый в дальнейшем «Исполнитель», в лице {p.signer.position.toLowerCase()}а {p.signer.name}, действующего на основании Устава, с одной стороны, и{" "}
        <b>{p.parentName}</b>, законный представитель обучающегося <b>{p.studentName}</b>, {p.birthYear} года рождения, именуемый(ая) в дальнейшем «Заказчик», с другой стороны, совместно именуемые «Стороны», заключили настоящее дополнительное соглашение о нижеследующем:
      </p>
      <p className="mt-3 text-justify indent-8">1. Изложить пункт {p.clause} Договора в следующей редакции:</p>
      <p className="mt-1 rounded border border-neutral-300 bg-neutral-50 px-4 py-2 text-justify italic">«{p.clause}. {p.text}»</p>
      <p className="mt-3 text-justify indent-8">2. Остальные условия Договора, не затронутые настоящим соглашением, остаются неизменными, и Стороны подтверждают по ним свои обязательства.</p>
      <p className="mt-1 text-justify indent-8">3. Настоящее соглашение вступает в силу с момента подписания, является неотъемлемой частью Договора и составлено в двух экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из Сторон.</p>
      <div className="mt-8 grid grid-cols-2 gap-10 break-inside-avoid">
        <div>
          <div className="font-semibold">Исполнитель</div>
          <div className="mt-1">{ORG.name}</div>
          <div className="text-[9.5pt]">{ORG.address}, УНП {ORG.unp}</div>
          <div className="mt-8 flex items-end gap-2">
            <span>{p.signer.position}</span>
            <span className="w-24 flex-1 border-b border-black" />
            <span>{p.signer.name.split(" ").map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ")}</span>
          </div>
          <div className="mt-1 text-[8.5pt]">М.П.</div>
        </div>
        <div>
          <div className="font-semibold">Заказчик</div>
          <div className="mt-1">{p.parentName}</div>
          <div className="text-[9.5pt]">тел. {formatPhone(p.parentPhone)}</div>
          <div className="mt-8 flex items-end gap-2">
            <span className="w-24 flex-1 border-b border-black" />
            <span>{p.parentName.split(" ").map((w, i) => (i === 0 ? w : `${w[0]}.`)).join(" ")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
