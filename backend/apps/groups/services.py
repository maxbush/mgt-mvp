"""Зачисления: enroll/unenroll/transfer + выборки членства."""
from datetime import date as _date

from django.db import transaction

from .models import Enrollment, Group, MembershipChange
from apps.core.dates import server_today


def _d(s):
    if isinstance(s, _date):
        return s
    y, m, d = s.split("-")
    return _date(int(y), int(m), int(d))


def student_current_groups(student, on=None):
    """Группы ученика сейчас; для выбывших — последние (порт studentGroups)."""
    
    t = on or server_today()
    en = list(student.enrollments.select_related("group").order_by("-date_from"))
    cur = [e for e in en if e.date_from <= t and (e.date_to is None or e.date_to >= t)]
    chosen = cur or en[:1]
    return [e.group for e in chosen]


def group_student_ids(group_id, on=None):
    
    d = on or server_today()
    return list(
        Enrollment.objects.filter(group_id=group_id, date_from__lte=d)
        .exclude(date_to__lt=d)
        .values_list("student_id", flat=True)
        .distinct()
    )


@transaction.atomic
def enroll(student, group, date_from, user=None):
    """Зачислить; пересечение с открытым членством в той же группе запрещено."""
    d = _d(date_from)
    if Enrollment.objects.filter(student=student, group=group, date_to__isnull=True).exists():
        raise ValueError("Ученик уже зачислен в эту группу")
    en = Enrollment.objects.create(student=student, group=group, date_from=d)
    MembershipChange.objects.create(student=student, kind="enroll", to_group=group, date=d, created_by=user)
    return en


@transaction.atomic
def unenroll(student, group, date_to, user=None):
    d = _d(date_to)
    en = Enrollment.objects.filter(student=student, group=group, date_to__isnull=True).first()
    if not en:
        raise ValueError("Нет активного зачисления")
    en.date_to = d
    en.save(update_fields=["date_to"])
    MembershipChange.objects.create(student=student, kind="unenroll", from_group=group, date=d, created_by=user)
    return en


@transaction.atomic
def transfer(student, from_group, to_group, date, user=None):
    """Атомарный перевод: закрыть членство в from_group, открыть в to_group."""
    unenroll(student, from_group, date, user=user)
    en = enroll(student, to_group, date, user=user)
    # правим запись аудита: последние две записи — unenroll+enroll; добавим сводную transfer
    MembershipChange.objects.create(
        student=student, kind="transfer", from_group=from_group, to_group=to_group, date=_d(date), created_by=user,
    )
    return en
