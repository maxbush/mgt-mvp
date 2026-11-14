from datetime import date as _date, timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.timezone import localdate
from rest_framework import viewsets
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.core.audit import audit, audit_delete
from apps.core.errors import ApiError, ConflictError, MonthClosedError, RoleScopeError
from apps.core.permissions import HasCode, has_code, teacher_group_ids
from apps.finance.models import MonthClose
from apps.groups.models import Group

from . import services as svc
from .models import Attendance, Lesson
from .serializers import AttendanceWriteSerializer, LessonSerializer, LessonWriteSerializer


def _deny(code, reason):
    if code == "month_closed":
        raise MonthClosedError(reason)
    if code in ("cancelled", "not_your_lesson", "read_only", "out_of_window"):
        raise RoleScopeError(reason)
    raise ConflictError(reason)


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def journal(request):
    """GET /journal?group=&month= — агрегат журнала."""
    if not has_code(request.user, "journal.view"):
        raise RoleScopeError("Нет права journal.view")
    group_id = request.query_params.get("group")
    month = request.query_params.get("month") or str(localdate())[:7]
    # scope преподавателя
    if request.user.role == "teacher" and request.user.teacher_id:
        if group_id not in {str(x) for x in teacher_group_ids(request.user)}:
            raise RoleScopeError("Группа вне вашего scope")
    return Response(svc.journal_payload(group_id, month, request.user))


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def journal_unmarked(request):
    """GET /journal/unmarked — занятия в прошлом без отметок."""
    qs = svc.unmarked_past_lessons()
    if request.user.role == "teacher" and request.user.teacher_id:
        qs = qs.filter(group_id__in=teacher_group_ids(request.user))
    return Response(LessonSerializer(qs[:200], many=True).data)


class LessonViewSet(viewsets.ModelViewSet):
    required_code = "journal.edit"
    view_code = "journal.view"
    permission_classes = [HasCode]

    def get_queryset(self):
        qs = Lesson.objects.select_related("group", "substitute_teacher").prefetch_related("marks")
        if not getattr(self, "swagger_fake_view", False) and self.request.user.role == "teacher" and self.request.user.teacher_id and not has_code(self.request.user, "finance.view"):
            qs = qs.filter(group_id__in=teacher_group_ids(self.request.user))
        for f in ("group", "date"):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return qs

    def get_serializer_class(self):
        return LessonSerializer if self.request.method == "GET" else LessonWriteSerializer

    def perform_create(self, s):
        lesson_date = str(s.validated_data["date"])
        if MonthClose.is_closed(lesson_date[:7]):
            raise MonthClosedError(f"Месяц {lesson_date[:7]} закрыт")
        g = s.validated_data["group"]
        if Lesson.objects.filter(group=g, date=s.validated_data["date"]).exists():
            raise ConflictError(f"Занятие группы {g.code} на {lesson_date} уже существует")
        with transaction.atomic():
            obj = s.save()
            audit(self.request.user, "create", "journal.lesson", obj.pk, after={"group": g.code, "date": lesson_date})

    def perform_update(self, s):
        obj = s.instance
        ok, code, reason = svc.lesson_edit_check(obj, self.request.user)
        if not ok and self.request.user.role != "admin":
            _deny(code, reason)
        if MonthClose.is_closed(str(obj.date)[:7]):
            raise MonthClosedError(f"Месяц {str(obj.date)[:7]} закрыт")
        with transaction.atomic():
            obj = s.save()
            audit(self.request.user, "update", "journal.lesson", obj.pk, after={"cancelled": obj.cancelled, "substitute": str(obj.substitute_teacher_id)})

    def perform_destroy(self, obj):
        if MonthClose.is_closed(str(obj.date)[:7]):
            raise MonthClosedError(f"Месяц {str(obj.date)[:7]} закрыт")
        if obj.marks.exists():
            raise ConflictError("Нельзя удалить занятие с отметками — отмените его")
        audit_delete(self.request, obj)

    @action(detail=True, methods=["put"])
    def attendance(self, request, pk=None):
        """PUT /lessons/{id}/attendance {marks: {student_id: status|null}}

        Идемпотентно: повтор той же отметки — no-op; null — снять отметку.
        """
        lesson = self.get_object()
        ok, code, reason = svc.lesson_edit_check(lesson, request.user)
        if not ok:
            _deny(code, reason)
        marks = request.data.get("marks", {})
        valid = {c[0] for c in Attendance.STATUS}
        changed = 0
        with transaction.atomic():
            for sid, status_v in marks.items():
                if status_v is None:
                    changed += Attendance.objects.filter(lesson=lesson, student_id=sid).delete()[0]
                    continue
                if status_v not in valid:
                    continue
                _, created = Attendance.objects.update_or_create(
                    lesson=lesson, student_id=sid,
                    defaults={"status": status_v, "updated_by": request.user},
                )
                changed += 1
            audit(request.user, "attendance", "journal.lesson", lesson.pk, after={"marks": marks})
        return Response({"updated": changed, "state": svc.lesson_state(lesson)})


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
def generate_lessons(request, group_id):
    """POST /groups/{id}/generate-lessons {month, days?:[weekday]} — генерация по будням.

    Создаёт занятия в указанные дни недели (по умолчанию group.weekdays);
    дубли по (group,date) пропускаются. Только на открытые месяцы.
    """
    if not has_code(request.user, "journal.edit"):
        raise RoleScopeError("Нет права journal.edit")
    g = get_object_or_404(Group, pk=group_id)
    month = request.data.get("month") or str(localdate())[:7]
    if MonthClose.is_closed(month):
        raise MonthClosedError(f"Месяц {month} закрыт")
    days = request.data.get("days") or g.weekdays or [1, 4]
    y, m = int(month[:4]), int(month[5:7])
    d = _date(y, m, 1)
    created = []
    with transaction.atomic():
        while d.month == m:
            if d.isoweekday() in days:
                _, made = Lesson.objects.get_or_create(group=g, date=d, defaults={"time": g.lesson_time})
                if made:
                    created.append(str(d))
            d += timedelta(days=1)
        audit(request.user, "generate", "journal.lesson", meta={"group": g.code, "month": month, "created": len(created)})
    return Response({"created": len(created), "dates": created})


@api_view(["GET"])
def marks_map(request):
    """GET /marks?from&to&group — вся карта отметок {lessonId|studentId: status}."""
    from .services import _ds
    qs = Attendance.objects.select_related("lesson")
    if request.query_params.get("group"):
        qs = qs.filter(lesson__group_id=request.query_params["group"])
    if request.query_params.get("from"):
        qs = qs.filter(lesson__date__gte=request.query_params["from"])
    if request.query_params.get("to"):
        qs = qs.filter(lesson__date__lte=request.query_params["to"])
    if request.user.role == "teacher" and request.user.teacher_id:
        qs = qs.filter(lesson__group_id__in=teacher_group_ids(request.user))
    return Response({f"{m.lesson_id}|{m.student_id}": m.status for m in qs})
