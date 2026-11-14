"""Порт src/lib/calc.ts — эталон денежных и доменных вычислений.

Все деньги — целые копейки (int) внутри сервисов. Конвертация Decimal<->int —
только на границах.
"""
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Optional, Sequence, TypedDict

CENT = Decimal("0.01")


def round_half_up(x) -> int:
    """Округление дробных копеек до целых half-up: floor(x + 0.5). roundHalfUp() из calc.ts."""
    return int((Decimal(str(x)) + Decimal("0.5")).to_integral_value(rounding="ROUND_FLOOR"))


def to_k(amount) -> int:
    """Рубли (Decimal/str/float) -> копейки, half-up. toK() из calc.ts."""
    return int(Decimal(str(amount)).quantize(CENT, rounding=ROUND_HALF_UP) * 100)


def from_k(kopecks: int) -> Decimal:
    return (Decimal(kopecks) / 100).quantize(CENT)


def pick_by(entries: Sequence, date: str, key: str):
    """Значение справочника «с даты действия»: последний элемент с from <= date.

    Fallback — самая ранняя запись (порт pickBy из calc.ts)."""
    items = sorted(entries, key=lambda x: x[key])
    if not items:
        return None
    val = items[0]
    for e in items:
        if e[key] <= date:
            val = e
    return val


def price_on(prices: Sequence, date: str, value_key: str = "price"):
    """Цена занятия на дату по истории цен [{from, price}]."""
    e = pick_by(prices, date, "from")
    return e[value_key] if e else Decimal("0")


def rate_on(rates: Sequence, date: str):
    e = pick_by(rates, date, "from")
    return e["rate"] if e else Decimal("0")


def is_chargeable(status: str, policy) -> bool:
    """present — всегда; прочее — по политике списаний (объект с флагами)."""
    if status == "present":
        return True
    if status == "absent":
        return bool(policy.charge_absent)
    if status == "sick":
        return bool(policy.charge_sick)
    if status == "excused":
        return bool(policy.charge_excused)
    return False


class ActAmounts(TypedDict):
    gross: Decimal
    income_tax: Decimal
    fszn: Decimal
    net: Decimal


def act_amounts(count: int, rate, income_pct=13, fszn_pct=1) -> ActAmounts:
    """Акт: копейки count*toK(rate); налоги — half-up от копеек (порт actAmounts)."""
    accrued = to_k(rate) * count
    income = round_half_up(accrued * Decimal(str(income_pct)) / 100)
    fszn = round_half_up(accrued * Decimal(str(fszn_pct)) / 100)
    return ActAmounts(gross=from_k(accrued), income_tax=from_k(income), fszn=from_k(fszn), net=from_k(accrued - income - fszn))


def balance_at(ledger: Sequence[dict], date: Optional[str] = None) -> int:
    """Копейки: сумма проводок (с учётом знака) до даты включительно."""
    total = 0
    for e in ledger:
        if date is None or e["date"] <= date:
            total += e["amount"]
    return total


class MonthRow(TypedDict):
    start: int
    paid: int
    spent: int
    spent_count: int
    end: int


def month_row_k(ledger: Sequence[dict], month: str) -> MonthRow:
    """monthRowK: стартовый остаток, оплачено(open+pay+adj), израсходовано(charge), конец.

    Все суммы в копейках. Списания в леджере хранятся отрицательными.
    """
    a, b = f"{month}-01", f"{month}-31"
    start = paid = spent = 0
    spent_count = 0
    for e in ledger:
        if e["date"] < a:
            start += e["amount"]
        elif e["date"] <= b:
            if e["type"] == "charge":
                spent -= e["amount"]
                spent_count += 1
            else:
                paid += e["amount"]
    return MonthRow(start=start, paid=paid, spent=spent, spent_count=spent_count, end=start + paid - spent)


# ---------- Договоры ----------
LAT2CYR = {"a": "а", "b": "в", "c": "с", "e": "е", "k": "к", "m": "м", "h": "н", "o": "о", "p": "р", "t": "т", "x": "х", "y": "у"}


def norm_contract_no(no: str) -> str:
    """Нормализация номера: нижний регистр, без пробелов, латиница->кириллица."""
    s = "".join((no or "").lower().split())
    return "".join(LAT2CYR.get(c, c) for c in s)


# ---------- ФИО: нормализация и сходство ----------
def norm_name(s: str) -> str:
    return " ".join((s or "").lower().replace("ё", "е").split())


def _lev(a: str, b: str) -> int:
    m, n = len(a), len(b)
    if not m:
        return n
    if not n:
        return m
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [i]
        for j in range(1, n + 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (0 if a[i - 1] == b[j - 1] else 1)))
        prev = cur
    return prev[n]


def similarity(a: str, b: str) -> float:
    """max(lev-отношение строк, lev-отношение отсортированных слов). Порт similarity()."""
    x, y = norm_name(a), norm_name(b)
    if not x or not y:
        return 0.0
    r1 = 1 - _lev(x, y) / max(len(x), len(y))
    sx = " ".join(sorted(x.split()))
    sy = " ".join(sorted(y.split()))
    r2 = 1 - _lev(sx, sy) / max(len(sx), len(sy))
    return max(r1, r2)


def similarity_pct(a: str, b: str) -> int:
    """Процент для показа: 100 — только точное совпадение."""
    if norm_name(a) == norm_name(b):
        return 100
    return min(round(similarity(a, b) * 100), 99)


def split_even(total_k: int, n: int) -> list[int]:
    """Доли в сумме дают ровно total; остаток — в последнюю долю."""
    base = total_k // n
    parts = [base] * n
    parts[-1] += total_k - base * n
    return parts


# ---------- Сумма прописью (BYN) ----------
_OM = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
_OF = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
_TE = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
_TN = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
_HN = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]


def _triple(n: int, fem: bool) -> str:
    out = [_HN[n // 100]]
    r = n % 100
    if 10 <= r < 20:
        out.append(_TE[r - 10])
    else:
        out.append(_TN[r // 10])
        out.append((_OF if fem else _OM)[r % 10])
    return " ".join(x for x in out if x)


def _plural(n: int, f1: str, f2: str, f5: str) -> str:
    a, b = n % 100, n % 10
    if 11 <= a <= 19:
        return f5
    if b == 1:
        return f1
    if 2 <= b <= 4:
        return f2
    return f5


def int_words(n: int) -> str:
    if n == 0:
        return "ноль"
    parts = []
    mil = n // 1_000_000
    th = n // 1000 % 1000
    rest = n % 1000
    if mil:
        parts.append(f"{_triple(mil, False)} {_plural(mil, 'миллион', 'миллиона', 'миллионов')}")
    if th:
        parts.append(f"{_triple(th, True)} {_plural(th, 'тысяча', 'тысячи', 'тысяч')}")
    if rest:
        parts.append(_triple(rest, False))
    return " ".join(parts)


def rub_words(kopecks: int) -> str:
    """«Девяносто три белорусских рубля, 04 копейки» — из копеек."""
    k = abs(int(kopecks))
    r, c = k // 100, k % 100
    s = f"{int_words(r)} {_plural(r, 'белорусский рубль', 'белорусских рубля', 'белорусских рублей')}, {c:02d} {_plural(c, 'копейка', 'копейки', 'копеек')}"
    return s[0].upper() + s[1:]
