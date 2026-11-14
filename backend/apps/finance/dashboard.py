"""GET /dashboard — порт dashboardKpis + attendanceSeries + financeSeries."""
from datetime import date as _date, timedelta


from apps.dictionaries.models import AcademicYear
from apps.core.dates import server_today
from apps.journal.models import Attendance, Lesson
from apps.staff.models import Teacher
from apps.students.models import Student

from .models import Payment
from .services import current_balance


def _shift_month(m, n):
    y, mo = int(m[:4]), int(m[5:7])
    total = y * 12 + (mo - 1) + n
    return f"{total // 12}-{total % 12 + 1:02d}"


def _att_stats(month, group_ids=None):
    qs = Attendance.objects.filter(lesson__date__startswith=month, lesson__cancelled=False)
    if group_ids is not None:
        qs = qs.filter(lesson__group_id__in=group_ids)
    total = qs.count()
    present = qs.filter(status="present").count()
    return {"total": total, "present": present, "rate": round(present / total * 100, 1) if total else 0}


def _months_of_year(up_to):
    y = AcademicYear.current()
    m = str(y.start_date)[:7] if y else "2026-09"
    out = []
    while m <= up_to:
        out.append(m)
        m = _shift_month(m, 1)
    return out


def dashboard_payload(scope_group_ids=None):
    today = str(server_today())
    m = today[:7]
    prev = _shift_month(m, -1)

    groups_qs = Lesson.objects.values_list("group_id", flat=True).distinct()
    if scope_group_ids is not None:
        student_ids = set(
            Attendance.objects.filter(lesson__group_id__in=scope_group_ids).values_list("student_id", flat=True)
        )
        from apps.groups.models import Enrollment
        student_ids |= set(Enrollment.objects.filter(group_id__in=scope_group_ids).values_list("student_id", flat=True))
        students = Student.objects.filter(id__in=student_ids)
    else:
        students = Student.objects.all()

    active = students.filter(status="active")
    balances = [float(current_balance(s.id)) for s in active]
    paid_m = sum(p.amount for p in Payment.objects.filter(status="confirmed", date__startswith=m))
    paid_prev = sum(p.amount for p in Payment.objects.filter(status="confirmed", date__startswith=prev))
    att, att_prev = _att_stats(m, scope_group_ids), _att_stats(prev, scope_group_ids)

    lessons_qs = Lesson.objects.filter(date__startswith=m, cancelled=False)
    if scope_group_ids is not None:
        lessons_qs = lessons_qs.filter(group_id__in=scope_group_ids)

    months = _months_of_year(m)
    series_att = [{"month": mm, **_att_stats(mm, scope_group_ids)} for mm in months]
    series_fin = []
    from .services import _charges_index
    charges = _charges_index()
    for mm in months:
        paid = sum(float(p.amount) for p in Payment.objects.filter(status="confirmed", date__startswith=mm))
        consumed = sum(-e["amount"] for arr in charges.values() for e in arr if e["date"].startswith(mm)) / 100
        series_fin.append({"month": mm, "paid": paid, "consumed": consumed})

    return {
        "today": today,
        "kpis": {
            "activeStudents": active.count(),
            "totalStudents": students.count(),
            "newThisMonth": students.filter(created_at__startswith=m).count(),
            "attendanceRate": att["rate"],
            "attendanceDelta": round(att["rate"] - att_prev["rate"], 1),
            "totalBalance": round(sum(balances), 2),
            "debtors": sum(1 for b in balances if b < 0),
            "paidThisMonth": float(paid_m),
            "paidDelta": round((float(paid_m) - float(paid_prev)) / float(paid_prev) * 100) if paid_prev else 0,
            "teachers": Teacher.objects.filter(status="active").count(),
            "lessonsThisMonth": lessons_qs.count(),
            "pending": Payment.objects.filter(status="pending").count(),
        },
        "attendanceSeries": series_att,
        "financeSeries": series_fin,
    }
