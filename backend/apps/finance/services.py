"""Финансовый сервисный слой — порт selectors.ts (ledger, balanceRow, statementRows).

Все суммы внутри — копейки (int); на выходе — Decimal BYN для API.
"""
from datetime import date as _date
from decimal import Decimal

from apps.core.dates import server_today

from apps.core.calc import (
    from_k, is_chargeable, month_row_k, norm_name, similarity_pct, split_even, to_k,
)
from apps.dictionaries.models import ChargePolicy
from apps.groups.models import Enrollment, Group
from apps.journal.models import Attendance, Lesson
from apps.students.models import Student

from .models import Adjustment, MonthBalance, MonthClose, Payment


def _ds(d):
    return d.isoformat() if isinstance(d, _date) else str(d)


# ---------- Списания (charge-проводки из отметок) ----------

def _charges_index():
    """Индекс списаний: student_id → [ledger-записи charge] (порт index().charges).

    Списание = отметка в журнале по политике chargeable на дату занятия
    × цена группы на дату занятия (исторические цены!). Отменённые занятия —
    никогда. Суммы отрицательные.
    """
    charges = {}
    lessons = {l.id: l for l in Lesson.objects.select_related("group").prefetch_related("group__prices").all()}
    marks = Attendance.objects.select_related("lesson").all()
    policy_cache = {}
    for m in marks:
        l = lessons.get(m.lesson_id)
        if not l or l.cancelled:
            continue
        d = _ds(l.date)
        if d not in policy_cache:
            policy_cache[d] = ChargePolicy.on(d)
        if not is_chargeable(m.status, policy_cache[d]):
            continue
        g = l.group
        price = g.price_on(d)
        suffix = {"absent": " (неявка)", "excused": " (уважительная)", "sick": " (болел)"}.get(m.status, "")
        charges.setdefault(str(m.student_id), []).append({
            "date": d, "type": "charge", "amount": -to_k(price),
            "label": f"Занятие {g.code}{suffix}", "ref": str(l.id), "groupId": str(g.id),
        })
    return charges


_METHOD_SRC = {"bepaid": "BePaid", "erip": "ЕРИП", "card": "карта", "cash": "наличные", "manual": "вручную"}


def ledger_entries(student_id, up_to=None):
    """Проводки ученика (порт ledger()). Порядок при равных датах:
    open → pay → adj → charge. Суммы в ответе — копейки со знаком."""
    sid = str(student_id)
    st = Student.objects.get(pk=sid)
    out = []
    opening_date = st.opening_date if hasattr(st, "opening_date") else None
    from apps.dictionaries.models import SystemSetting

    opening_date = SystemSetting.get("opening_date", "2026-08-31")
    if st.opening_balance and to_k(st.opening_balance):
        out.append({"date": opening_date, "type": "open", "amount": to_k(st.opening_balance),
                    "label": "Начальный остаток (перенос из Excel)"})
    for p in Payment.objects.filter(status="confirmed").prefetch_related("splits"):
        splits = list(p.splits.all())
        if splits:
            for x in splits:
                if str(x.student_id) == sid:
                    out.append({
                        "date": _ds(p.date), "type": "pay", "amount": to_k(x.amount),
                        "label": f"Платёж ({_METHOD_SRC.get(p.method, p.method)}), часть общего платежа {p.amount} BYN",
                        "ref": str(p.id),
                    })
        elif str(p.student_id) == sid:
            payer = f": {p.payer}" if p.payer else ""
            out.append({"date": _ds(p.date), "type": "pay", "amount": to_k(p.amount),
                        "label": f"Платёж ({_METHOD_SRC.get(p.method, p.method)}){payer}", "ref": str(p.id)})
    for a in Adjustment.objects.filter(student_id=sid):
        out.append({"date": _ds(a.date), "type": "adj", "amount": to_k(a.amount),
                    "label": f"Корректировка: {a.comment}", "ref": str(a.id)})
    out += _charges_index().get(sid, [])
    if up_to:
        out = [e for e in out if e["date"] <= up_to]
    order = {"open": 0, "pay": 1, "adj": 2, "charge": 3}
    out.sort(key=lambda e: (e["date"], order[e["type"]]))
    return out


def balance_row(student_id, month):
    r = month_row_k(ledger_entries(student_id), month)
    return {
        "month": month, "opening": float(from_k(r["start"])), "paid": float(from_k(r["paid"])),
        "consumedCount": r["spent_count"], "consumed": float(from_k(r["spent"])),
        "closing": float(from_k(r["end"])),
    }


def balance_history(student_id, up_to=None):
    from apps.dictionaries.models import AcademicYear

    y = AcademicYear.current()
    if not y:
        return []
    m = _ds(y.start_date)[:7]
    last = up_to or str(server_today())[:7]
    rows = []
    while m <= last:
        rows.append(balance_row(student_id, m))
        y0, m0 = int(m[:4]), int(m[5:7]) + 1
        m = f"{y0 + (m0 > 12)}-{(m0 - 1) % 12 + 1:02d}"
    return rows


def current_balance(student_id):
    return from_k(sum(e["amount"] for e in ledger_entries(student_id)))


# ---------- Ведомость (листы) ----------

def _sheet_groups(sheet):
    """group_ids листа ведомости: по kind (branch без IT / direction / custom)."""
    from apps.dictionaries.models import StatementSheet

    if isinstance(sheet, StatementSheet):
        if sheet.kind == "branch" and sheet.branch_id:
            return set(map(str, Group.objects.filter(branch_id=sheet.branch_id).exclude(direction="it").values_list("id", flat=True)))
        if sheet.kind == "direction" and sheet.direction_id:
            return set(map(str, Group.objects.filter(direction=sheet.direction.code).values_list("id", flat=True)))
        return set(map(str, sheet.group_ids or []))
    return set()


def statement_rows(sheet, month, group_id=None, debt_only=False):
    """Строки ведомости за месяц (порт statementRows)."""
    gids = _sheet_groups(sheet)
    a, b = f"{month}-01", f"{month}-31"
    charges_idx = _charges_index()
    groups_map = {str(g.id): g for g in Group.objects.all()}
    rows = []
    for st in Student.objects.prefetch_related("enrollments").all():
        en = list(st.enrollments.all())
        overlap = [e for e in en if _ds(e.date_from) <= b and (e.date_to is None or _ds(e.date_to) >= a)]
        led = ledger_entries(st.id)
        month_charges = [e for e in led if e["type"] == "charge" and a <= e["date"] <= b]
        r = month_row_k(led, month)
        show = any(str(e.group_id) in gids for e in overlap) or any(c.get("groupId") in gids for c in month_charges)
        if not show and not overlap and not month_charges:
            last = sorted(en, key=lambda e: _ds(e.date_to or "9999"), reverse=True)
            if last and str(last[0].group_id) in gids and (r["start"] or r["end"] or r["paid"]):
                show = True
        if not show:
            continue
        by_group = {}
        for c in month_charges:
            if c.get("groupId"):
                by_group[c["groupId"]] = by_group.get(c["groupId"], 0) - from_k(c["amount"])
        grs = [groups_map[str(e.group_id)] for e in overlap if str(e.group_id) in gids and str(e.group_id) in groups_map]
        if not grs:
            last = sorted(en, key=lambda e: _ds(e.date_to or "9999"), reverse=True)
            if last and str(last[0].group_id) in groups_map:
                grs = [groups_map[str(last[0].group_id)]]
        grs = list({g.id: g for g in grs}.values())
        if group_id and not any(str(g.id) == group_id for g in grs):
            continue
        if debt_only and r["end"] >= 0:
            continue
        rows.append({
            "student": {"id": str(st.id), "name": str(st), "grade": st.grade, "status": st.status},
            "groups": [{"id": str(g.id), "code": g.code, "name": g.name} for g in grs],
            "opening": float(from_k(r["start"])), "paid": float(from_k(r["paid"])),
            "consumedCount": r["spent_count"], "consumed": float(from_k(r["spent"])),
            "closing": float(from_k(r["end"])),
            "byGroup": {gid: float(v) for gid, v in by_group.items()},
            "multi": len(by_group) > 1 or any(str(e.group_id) not in gids for e in overlap),
            "foreign": any(k not in gids for k in by_group),
        })
    rows.sort(key=lambda r: r["student"]["name"])
    return rows


def statement_totals(rows):
    k = lambda f: float(from_k(sum(to_k(f(r)) for r in rows)))
    return {"opening": k(lambda r: r["opening"]), "paid": k(lambda r: r["paid"]),
            "consumed": k(lambda r: r["consumed"]), "closing": k(lambda r: r["closing"])}


# ---------- Платежи: сопоставление ----------

def payment_candidates(payer, n=3):
    return [
        {"student": {"id": str(s.id), "name": str(s)}, "pct": similarity_pct(payer, str(s))}
        for s in sorted(Student.objects.all(), key=lambda s: -similarity_pct(payer, str(s)))[:n]
    ]


def exact_student_matches(payer):
    np_ = norm_name(payer)
    return [s for s in Student.objects.all() if norm_name(str(s)) == np_]
