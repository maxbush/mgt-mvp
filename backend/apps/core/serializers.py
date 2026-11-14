from rest_framework import serializers

from .models import AuditLog, RolePermission, User
from .permissions import user_codes


class UserSerializer(serializers.ModelSerializer):
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "is_active", "teacher", "teacher_name"]

    def get_teacher_name(self, o):
        return str(o.teacher) if o.teacher_id else None


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class AuditSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ["id", "at", "user", "user_name", "action", "entity", "entity_id", "before", "after", "meta"]

    def get_user_name(self, o):
        return o.user.get_full_name() or (o.user.username if o.user_id else "система")


def me_payload(user):
    """Ответ /auth/me: юзер, роль, права, scope преподавателя, окружение."""
    from apps.dictionaries.models import AcademicYear
    from apps.finance.models import MonthClose

    g = user.groups.first()
    return {
        "user": UserSerializer(user).data,
        "role": g.name if g else user.role,
        "permissions": sorted(user_codes(user)),
        "teacher_id": str(user.teacher_id) if user.teacher_id else None,
        "server_date": str(__import__("django.utils.timezone", fromlist=["localdate"]).localdate()),
        "current_academic_year": AcademicYearSerializer(AcademicYear.current()).data if AcademicYear.current() else None,
        "closed_months": list(MonthClose.objects.filter(reopened_at__isnull=True).values_list("month", flat=True)),
    }


# локальный импорт чтобы избежать цикла
from apps.dictionaries.serializers import AcademicYearSerializer  # noqa: E402
