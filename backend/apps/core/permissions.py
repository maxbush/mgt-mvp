"""Серверные проверки прав по матрице role_permission (п. 4.3 ТЗ)."""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import RolePermission

ALL_CODES = [
    "students.view", "students.edit", "students.delete", "groups.view", "groups.edit",
    "journal.view", "journal.edit", "finance.view", "finance.edit", "teachers.view",
    "teachers.edit", "acts.view", "acts.sign", "settings.edit", "audit.view",
    "payments.import", "month.close", "documents.print", "payments.manage",
]

ROLE_DEFAULTS = {
    "admin": ALL_CODES,
    "teacher": ["journal.view", "journal.edit", "students.view", "groups.view", "documents.print"],
    "accountant": [
        "students.view", "groups.view", "journal.view", "finance.view", "teachers.view",
        "acts.view", "documents.print", "payments.manage", "payments.import", "month.close",
    ],
    "director": [
        "students.view", "groups.view", "journal.view", "finance.view", "teachers.view",
        "acts.view", "documents.print", "audit.view",
    ],
}


def role_name(user):
    g = user.groups.first()
    return g.name if g else user.role


def user_codes(user):
    g = user.groups.first()
    if g is not None:
        codes = set(RolePermission.objects.filter(group=g).values_list("codename", flat=True))
        if codes:
            return codes
    return set(ROLE_DEFAULTS.get(role_name(user), []))


def has_code(user, code):
    return user.is_superuser or code in user_codes(user)


class HasCode(BasePermission):
    """DRF permission: `required_code` на view; для SAFE-методов — `view_code`."""

    required_code = ""
    view_code = ""

    def has_permission(self, request, view):
        code = getattr(view, "required_code", self.required_code)
        vcode = getattr(view, "view_code", self.view_code) or code
        need = vcode if request.method in SAFE_METHODS and vcode else code
        if not need:
            return True
        return has_code(request.user, need)


def teacher_group_ids(user):
    """Группы преподавателя: свои + группы, где он замещал (для scope)."""
    if not getattr(user, "teacher_id", None):
        return set()
    from apps.groups.models import Group
    from apps.journal.models import Lesson

    own = set(Group.objects.filter(teacher_id=user.teacher_id).values_list("id", flat=True))
    subs = set(Lesson.objects.filter(substitute_teacher_id=user.teacher_id).values_list("group_id", flat=True))
    return own | subs


def scoped_student_ids(user):
    """None — без ограничений; иначе множество id учеников групп преподавателя."""
    if getattr(user, "role", None) == "teacher" and getattr(user, "teacher_id", None) and not has_code(user, "finance.view"):
        from apps.groups.models import Enrollment

        return set(Enrollment.objects.filter(
            group_id__in=teacher_group_ids(user), date_to__isnull=True,
        ).values_list("student_id", flat=True))
    return None
