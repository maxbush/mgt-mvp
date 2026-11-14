"""Журнал: занятия, отметки, права правки (порт lessonEditCheck/lessonState)."""
from datetime import date as _date, timedelta


from apps.finance.models import MonthClose
from apps.core.dates import server_today

from .models import Attendance, Lesson


def _ds(d):
    return d.isoformat() if isinstance(d, _date) else str(d)


def lesson_state(lesson):
    """planned | held | cancelled — held = есть хоть одна отметка, не отменён."""
    if lesson.cancelled:
        return "cancelled"
    return "held" if lesson.marks.exists() else "planned"


def lesson_edit_check(lesson, user):
    """Право правки отметок (порт lessonEditCheck):
    закрытый месяц → 423 для всех; отменённое — нельзя; преподаватель —
    только свои занятия (основной или замена) и только текущий/прошлый месяц;
    бухгалтер — только чтение.
    Возвращает (ok, reason, http_code).
    """
    m = _ds(lesson.date)[:7]
    if MonthClose.is_closed(m):
        return False, "month_closed", f"Месяц {m} закрыт: журналы, платежи и проводки за него не редактируются."
    if lesson.cancelled:
        return False, "cancelled", "Занятие не состоялось — отметки не ставятся и ничего не списывают."
    role = user.role
    if role == "accountant":
        return False, "read_only", "У роли «Бухгалтер» журнал доступен только для чтения."
    if role == "teacher":
        eff = lesson.effective_teacher_id
        if user.teacher_id and eff != user.teacher_id:
            return False, "not_your_lesson", "Это занятие ведёт другой преподаватель. Править может только преподаватель занятия (основной или замена)."
        cur = server_today()
        cur_m = cur.strftime("%Y-%m")
        prev = (cur.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        if m not in (cur_m, prev):
            return False, "out_of_window", "Преподаватель может править только текущий и предыдущий месяц. Обратитесь к администратору."
    return True, "", ""


def group_lessons(group_id, month=None):
    qs = Lesson.objects.filter(group_id=group_id).order_by("date")
    if month:
        qs = qs.filter(date__startswith=month)
    return qs


def unmarked_past_lessons(up_to_month=None, today=None):
    """Занятия в прошлом без единой отметки (порт pastUnmarkedLessons)."""
    t = today or _ds(server_today())
    qs = Lesson.objects.filter(date__lt=t, cancelled=False).exclude(marks__isnull=False).distinct()
    if up_to_month:
        qs = qs.filter(date__lt=f"{up_to_month}-01")
    return qs


def journal_payload(group_id, month, user):
    """GET /journal?group=&month= — агрегат для страницы журнала.

    Группа, ученики (числившиеся в месяце; неактивные — только с отметками),
    занятия, отметки {lessonId|studentId: status}, итоги и флаги правки.
    """
    from apps.groups.services import group_student_ids
    from apps.students.models import Student

    lessons = list(group_lessons(group_id, month))
    a, b = f"{month}-01", f"{month}-31"
    # ученики, числившиеся в течение месяца (Enrollment пересекается с месяцем)
    from apps.groups.models import Enrollment

    ens = Enrollment.objects.filter(group_id=group_id, date_from__lte=b).exclude(date_to__lt=a).select_related("student")
    students = {}
    for e in ens:
        students[str(e.student_id)] = e.student
    marks = {}
    for l in lessons:
        for m in l.marks.select_related("student").all():
            marks[f"{l.id}|{m.student_id}"] = m.status
    # неактивные — только если есть отметки в месяце
    marked_sids = {k.split("|")[1] for k in marks}
    student_list = [s for sid, s in students.items() if s.status == "active" or sid in marked_sids]
    student_list.sort(key=lambda s: (s.last_name, s.first_name))
    out_lessons = []
    for l in lessons:
        ok, code, reason = lesson_edit_check(l, user)
        marked = sum(1 for k in marks if k.startswith(f"{l.id}|"))
        out_lessons.append({
            "id": str(l.id), "date": _ds(l.date), "time": l.time, "topic": l.topic,
            "cancelled": l.cancelled, "cancel_reason": l.cancel_reason,
            "substitute_teacher": str(l.substitute_teacher_id) if l.substitute_teacher_id else None,
            "effective_teacher": str(l.effective_teacher_id) if l.effective_teacher_id else None,
            "state": lesson_state(l), "marked_count": marked,
            "editable": ok, "edit_denied_reason": reason or None,
        })
    return {
        "group": group_id,
        "month": month,
        "students": [{"id": str(s.id), "name": str(s), "grade": s.grade, "status": s.status,
                      "parent_phone": s.parent_phone} for s in student_list],
        "lessons": out_lessons,
        "marks": marks,
    }
