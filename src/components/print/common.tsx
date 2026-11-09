import type { PrintSigner } from "@/components/shared/print-preview";
import { formatDate } from "@/lib/utils";

export const ORG = {
  name: "Минский городской технопарк",
  unit: "Инженерная школа",
  address: "220033, г. Минск, Партизанский пр., 8",
  unp: "192000000",
  phone: "+375 (17) 000-00-00",
};

export function DocHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-6 text-[9.5pt] leading-tight">
        <div>
          <div className="font-semibold">{ORG.name}</div>
          <div>{ORG.unit}</div>
          <div>{ORG.address}</div>
        </div>
        {right}
      </div>
      <h1 className="mt-5 text-center text-[13pt] font-bold uppercase tracking-wide">{title}</h1>
      {subtitle && <p className="mt-1 text-center text-[10.5pt]">{subtitle}</p>}
    </div>
  );
}

export function SignatureBlock({ signer, date, label, secondary }: { signer: PrintSigner; date?: string; label?: string; secondary?: PrintSigner }) {
  return (
    <div className="mt-8 break-inside-avoid text-[10.5pt]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
        <div>
          <div>{label ?? signer.position}</div>
        </div>
        <div className="w-40 border-b border-black" />
        <div className="text-right">{signer.name}</div>
      </div>
      {secondary && (
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-4">
          <div>{secondary.position}</div>
          <div className="w-40 border-b border-black" />
          <div className="text-right">{secondary.name}</div>
        </div>
      )}
      <div className="mt-4 text-[9.5pt]">
        {date ? `«${formatDate(date).slice(0, 2)}» ${monthName(date)} ${date.slice(0, 4)} г.` : "«____» ______________ 20___ г."}
      </div>
      <div className="mt-1 text-[8.5pt] text-neutral-600">М.П.</div>
    </div>
  );
}

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export function monthName(iso: string) {
  return MONTHS_GEN[Number(iso.slice(5, 7)) - 1];
}
export function dateLong(iso: string) {
  return `«${iso.slice(8, 10)}» ${monthName(iso)} ${iso.slice(0, 4)} г.`;
}

/* ---------- Сумма прописью (рус.) ---------- */
const ONES = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять", "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const ONES_F = ["", "одна", "две"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function pluralForm(n: number, forms: [string, string, string]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

function triad(n: number, feminine = false): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest < 20) {
    if (rest) parts.push(feminine && rest < 3 ? ONES_F[rest] : ONES[rest]);
  } else {
    parts.push(TENS[Math.floor(rest / 10)]);
    const o = rest % 10;
    if (o) parts.push(feminine && o < 3 ? ONES_F[o] : ONES[o]);
  }
  return parts.join(" ");
}

export function numberToWords(n: number): string {
  if (n === 0) return "ноль";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const units = n % 1000;
  const out: string[] = [];
  if (millions) out.push(triad(millions), pluralForm(millions, ["миллион", "миллиона", "миллионов"]));
  if (thousands) out.push(triad(thousands, true), pluralForm(thousands, ["тысяча", "тысячи", "тысяч"]));
  if (units) out.push(triad(units));
  return out.join(" ").replace(/\s+/g, " ").trim();
}

export function moneyToWords(amount: number): string {
  const rub = Math.floor(Math.abs(amount) + 1e-9);
  const kop = Math.round((Math.abs(amount) - rub) * 100);
  const words = numberToWords(rub);
  const s = `${words} ${pluralForm(rub, ["белорусский рубль", "белорусских рубля", "белорусских рублей"])} ${String(kop).padStart(2, "0")} ${pluralForm(kop, ["копейка", "копейки", "копеек"])}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
