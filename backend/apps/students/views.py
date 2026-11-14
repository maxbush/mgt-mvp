from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import audit, audit_save
from apps.core.calc import norm_contract_no
from apps.core.errors import ConflictError
from apps.core.permissions import HasCode

from .models import Contract, Student
from .serializers import ContractSerializer, StudentSerializer, StudentWriteSerializer


def contract_conflict(number, academic_year_id, exclude_id=None):
    """409-конфликт номера договора внутри учебного года → сообщение как во фронте."""
    n = norm_contract_no(number)
    if not n:
        return None
    qs = Contract.objects.filter(academic_year_id=academic_year_id, number_norm=n).exclude(id=exclude_id).select_related("student")
    c = qs.first()
    if not c:
        return None
    st = c.student
    return {"message": f"Номер {number.strip()} уже занят: {st}, от {c.date.strftime('%d.%m.%Y')}"}


class StudentViewSet(viewsets.ModelViewSet):
    required_code = "students.edit"
    view_code = "students.view"
    permission_classes = [HasCode]
    filterset_fields = ["status"]
    search_fields = ["last_name", "first_name", "parent_phone"]

    def get_serializer_class(self):
        return StudentSerializer if self.request.method in ("GET", "HEAD") else StudentWriteSerializer

    def get_queryset(self):
        qs = Student.objects.prefetch_related("contracts__academic_year")
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(last_name__icontains=q) | Q(first_name__icontains=q)
                | Q(parent_name__icontains=q) | Q(parent_phone__icontains=q)
            )
        if self.request.query_params.get("branch"):
            qs = qs.filter(enrollments__group__branch_id=self.request.query_params["branch"], enrollments__to__isnull=True)
        if self.request.query_params.get("group"):
            qs = qs.filter(enrollments__group_id=self.request.query_params["group"], enrollments__to__isnull=True)
        if self.request.query_params.get("year"):
            qs = qs.filter(contracts__academic_year_id=self.request.query_params["year"])
        if self.request.query_params.get("status"):
            qs = qs.filter(status=self.request.query_params["status"])
        return qs.distinct()

    def perform_create(self, s):
        audit_save(self.request, s, "create", after=lambda obj: s.data)

    def perform_update(self, s):
        audit_save(self.request, s, "update", after=lambda obj: s.data)

    def destroy(self, request, *a, **kw):
        """Удаление только при отсутствии связанных данных — иначе 409."""
        st = self.get_object()
        if st.contracts.exists() or st.payments.exists() or st.enrollments.exists():
            raise ConflictError("Нельзя удалить ученика: есть договоры/платежи/зачисления. Переведите в статус «выбыл».")
        with transaction.atomic():
            audit(request.user, "delete", "students.student", st.pk)
            st.delete()
        return Response(status=204)

    @action(detail=False, methods=["post"], url_path="bulk-status")
    def bulk_status(self, request):
        ids, status_v = request.data.get("ids", []), request.data.get("status")
        if status_v not in ("active", "inactive"):
            return Response({"error": {"code": "validation", "message": "status: active|inactive", "details": {}}}, status=400)
        with transaction.atomic():
            n = Student.objects.filter(id__in=ids).update(status=status_v)
            audit(request.user, "status", "students.student", meta={"ids": ids, "status": status_v})
        return Response({"updated": n})

    @action(detail=True, methods=["get", "post"])
    def contracts(self, request, pk=None):
        st = self.get_object()
        if request.method == "GET":
            return Response(ContractSerializer(st.contracts.select_related("academic_year"), many=True).data)
        s = ContractSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        c = contract_conflict(s.validated_data["number"], str(s.validated_data["academic_year"].id))
        if c:
            raise ConflictError(c["message"])
        with transaction.atomic():
            obj = Contract.objects.create(student=st, **s.validated_data)
            audit(request.user, "create", "students.contract", obj.pk, after=ContractSerializer(obj).data)
        return Response(ContractSerializer(obj).data, status=201)

    @action(detail=True, methods=["get"])
    def ledger(self, request, pk=None):
        from apps.finance.services import ledger_entries

        return Response(ledger_entries(self.get_object().id))

    @action(detail=True, methods=["get"], url_path="balance-history")
    def balance_history(self, request, pk=None):
        from apps.finance.services import balance_history

        return Response(balance_history(self.get_object().id, up_to=request.query_params.get("up_to")))


class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.select_related("student", "academic_year")
    serializer_class = ContractSerializer
    required_code = "students.edit"
    view_code = "students.view"
    permission_classes = [HasCode]
    http_method_names = ["get", "patch", "post", "head", "options"]

    def perform_update(self, s):
        c = contract_conflict(s.validated_data.get("number", s.instance.number), str(s.instance.academic_year_id), exclude_id=s.instance.id)
        if c:
            raise ConflictError(c["message"])
        audit_save(self.request, s, "update", after=lambda obj: s.data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        obj = self.get_object()
        obj.status = "closed"
        obj.save(update_fields=["status"])
        audit(request.user, "status", "students.contract", obj.pk, after={"status": "closed"})
        return Response(ContractSerializer(obj).data)

    @action(detail=False, methods=["get"], url_path="check-number")
    def check_number(self, request):
        number = request.query_params.get("number", "")
        year = request.query_params.get("year", "")
        exclude = request.query_params.get("exclude")
        c = contract_conflict(number, year, exclude_id=exclude)
        return Response({"taken": bool(c), "message": c["message"] if c else None})
