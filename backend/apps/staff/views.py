from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import audit, audit_delete, audit_save
from apps.core.calc import act_amounts, rate_on
from apps.core.errors import ConflictError, RoleScopeError
from apps.core.permissions import HasCode, has_code
from apps.dictionaries.models import ActRate, TaxRate

from .models import Act, Teacher
from .serializers import ActSerializer, ActWriteSerializer, TeacherSerializer, TeacherWriteSerializer

SENSITIVE = {"passport_series", "passport_number", "passport_issued", "personal_number", "iban", "address_reg"}


class TeacherViewSet(viewsets.ModelViewSet):
    required_code = "teachers.edit"
    view_code = "teachers.view"
    permission_classes = [HasCode]
    queryset = Teacher.objects.all()

    def get_serializer_class(self):
        return TeacherSerializer if self.request.method == "GET" else TeacherWriteSerializer

    def get_serializer(self, *a, **kw):
        """Маскировка чувствительных полей реализована в list/retrieve (SENSITIVE)."""
        return super().get_serializer(*a, **kw)

    def list(self, request, *a, **kw):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        data = TeacherSerializer(page if page is not None else qs, many=True).data
        if getattr(request.user, "role", None) == "teacher" and not has_code(request.user, "teachers.edit"):
            own = str(request.user.teacher_id or "")
            for row in data:
                if row["id"] != own:
                    for f in SENSITIVE:
                        row.pop(f, None)
        if page is not None:
            return self.get_paginated_response(data)
        return Response(data)

    def retrieve(self, request, *a, **kw):
        data = TeacherSerializer(self.get_object()).data
        if getattr(request.user, "role", None) == "teacher" and not has_code(request.user, "teachers.edit") and str(request.user.teacher_id or "") != data["id"]:
            for f in SENSITIVE:
                data.pop(f, None)
        return Response(data)

    def perform_create(self, s):
        audit_save(self.request, s, "create")

    def perform_update(self, s):
        audit_save(self.request, s, "update")

    @action(detail=True, methods=["post"])
    def status(self, request, pk=None):
        obj = self.get_object()
        obj.status = request.data.get("status", obj.status)
        obj.save(update_fields=["status"])
        audit(request.user, "status", "staff.teacher", obj.pk, after={"status": obj.status})
        return Response(TeacherSerializer(obj).data)


class ActViewSet(viewsets.ModelViewSet):
    required_code = "acts.edit"
    view_code = "acts.view"
    permission_classes = [HasCode]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def check_permissions(self, request):
        """sign/unsign — отдельное право acts.sign (директор/админ), остальные записи — acts.edit."""
        if getattr(self, "action", None) in ("sign", "unsign"):
            if not has_code(request.user, "acts.sign"):
                self.permission_denied(request, message="Нет права acts.sign")
            return
        super().check_permissions(request)

    def get_serializer_class(self):
        return ActSerializer if self.request.method == "GET" else ActWriteSerializer

    def get_queryset(self):
        qs = Act.objects.select_related("teacher", "signer")
        if self.request.query_params.get("month"):
            qs = qs.filter(month=self.request.query_params["month"])
        if self.request.query_params.get("teacher"):
            qs = qs.filter(teacher_id=self.request.query_params["teacher"])
        return qs

    def perform_create(self, s):
        audit_save(self.request, s, "act", after={"teacher": str(s.validated_data.get("teacher_id", "")), "month": str(s.validated_data.get("month", ""))})

    def perform_update(self, s):
        if s.instance.status == "signed":
            raise ConflictError("Подписанный акт нельзя редактировать — снимите подпись")
        audit_save(self.request, s, "act")

    def perform_destroy(self, obj):
        if obj.status == "signed":
            raise ConflictError("Подписанный акт нельзя удалить — снимите подпись")
        audit_delete(self.request, obj, "act")

    @action(detail=True, methods=["post"])
    def sign(self, request, pk=None):
        obj = self.get_object()
        obj.status = "signed"
        obj.save(update_fields=["status"])
        audit(request.user, "act", "staff.act", obj.pk, after={"status": "signed"})
        return Response(ActSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def unsign(self, request, pk=None):
        from apps.finance.models import MonthClose

        if MonthClose.is_closed(self.get_object().month):
            from apps.core.errors import MonthClosedError
            raise MonthClosedError("Месяц закрыт — снятие подписи запрещено")
        obj = self.get_object()
        obj.status = "draft"
        obj.save(update_fields=["status"])
        audit(request.user, "act", "staff.act", obj.pk, after={"status": "draft"})
        return Response(ActSerializer(obj).data)

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        """POST /acts/generate {month} — акты из журнала для всех активных преподавателей.

        Проведённые занятия (есть отметки, не отменены), где преподаватель —
        основной или замена. Ставка — на дату месяца (исторические ставки).
        Идемпотентно: существующие акты за месяц не дублируются.
        """
        from apps.journal.models import Lesson
        from django.db.models import Count

        month = request.data.get("month")
        if not month:
            raise ConflictError("Нужен параметр month")
        rate_entries = [{"from": r.date_from.isoformat(), "rate": r.rate} for r in ActRate.objects.all()]
        income = TaxRate.on("income_tax", f"{month}-28") or 13
        fszn = TaxRate.on("fszn", f"{month}-28") or 1
        created = []
        with transaction.atomic():
            for t in Teacher.objects.filter(status="active"):
                lessons = [
                    l for l in Lesson.objects.filter(date__startswith=month, cancelled=False)
                    .select_related("group").annotate(n=Count("marks")).filter(n__gt=0)
                    if str(l.effective_teacher_id) == str(t.id)
                ]
                if not lessons:
                    continue
                count = len(lessons)
                r = rate_on(rate_entries, f"{month}-28")
                am = act_amounts(count, r, income, fszn)
                act_obj, made = Act.objects.update_or_create(
                    teacher=t, month=month, number=f"{month.replace('-', '/')}/{t.last_name[:3].upper()}",
                    defaults={
                        "lessons_count": count, "rate": r, "gross": am["gross"],
                        "income_tax": am["income_tax"], "fszn": am["fszn"], "net": am["net"],
                        "source": "journal", "status": "draft",
                    },
                )
                if made:
                    created.append(str(act_obj.id))
            audit(request.user, "act", "staff.act", meta={"month": month, "generated": len(created)})
        return Response({"generated": len(created), "acts": created})
