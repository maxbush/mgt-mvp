"""Документы: доп.соглашения, print-data endpoints, XLSX-экспорты."""
import io
import re
from datetime import date as _date

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.core.audit import audit, audit_save
from apps.core.calc import rub_words, to_k
from apps.core.errors import ConflictError, RoleScopeError
from apps.core.permissions import HasCode, has_code, scoped_student_ids, teacher_group_ids
from apps.dictionaries.models import AddendumTemplate, Signer, StatementSheet
from apps.finance import services as fin
from apps.finance.services import statement_rows, statement_totals
from apps.journal.services import journal_payload
from apps.staff.models import Act
from apps.students.models import Contract, Student

from .models import Addendum
from .serializers import AddendumSerializer


def _substitute(body, ctx):
    def rep(m):
        return str(ctx.get(m.group(1).strip(), m.group(0)))
    return re.sub(r"\{\{\s*([\w.]+)\s*\}\}", rep, body)


def _contract_ctx(contract):
    st = contract.student
    return {
        "contract_number": contract.number,
        "contract_date": contract.date.strftime("%d.%m.%Y"),
        "student_name": str(st),
        "parent_name": st.parent_name,
        "parent_phone": st.parent_phone,
        "grade": st.grade,
        "school": st.school,
        "year": contract.academic_year.name,
    }


class AddendumViewSet(viewsets.ModelViewSet):
    queryset = Addendum.objects.select_related("contract__student", "template")
    serializer_class = AddendumSerializer
    required_code = "students.edit"
    view_code = "documents.print"
    permission_classes = [HasCode]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        ids = scoped_student_ids(self.request.user)
        return qs.filter(contract__student_id__in=ids) if ids is not None else qs

    def perform_create(self, s):
        audit_save(self.request, s, "create", save_kwargs={"created_by": self.request.user})

    @action(detail=False, methods=["post"], url_path="preview")
    def preview(self, request):
        """POST /addendums/preview {contract_id, template_id, vars?:{...}}"""
        qs = Contract.objects.all()
        ids = scoped_student_ids(request.user)
        if ids is not None:
            qs = qs.filter(student_id__in=ids)
        contract = get_object_or_404(qs, pk=request.data.get("contract_id"))
        tpl = get_object_or_404(AddendumTemplate, pk=request.data.get("template_id"))
        ctx = {**_contract_ctx(contract), **(request.data.get("vars") or {})}
        return Response({"body": _substitute(tpl.body, ctx), "context": ctx})


# ---------- print-data ----------

@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def print_act(request, act_id):
    """GET /print-data/act/{id} — данные для печатной формы акта."""
    a = get_object_or_404(Act.objects.select_related("teacher", "signer"), pk=act_id)
    if not has_code(request.user, "acts.view") and str(a.teacher_id) != str(getattr(request.user, "teacher_id", None)):
        raise RoleScopeError("Акт доступен только его преподавателю и ролям с acts.view")
    from apps.journal.models import Lesson
    from django.db.models import Count

    lessons = [
        l for l in Lesson.objects.filter(date__startswith=a.month, cancelled=False)
        .select_related("group").annotate(n=Count("marks")).filter(n__gt=0)
        if str(l.effective_teacher_id) == str(a.teacher_id)
    ]
    return Response({
        "number": a.number, "month": a.month,
        "teacher": {"name": str(a.teacher), "position": "Преподаватель"},
        "signer": {"name": a.signer.name, "position": a.signer.position} if a.signer_id else None,
        "lessons": [{"date": str(l.date), "group": l.group.code, "topic": l.topic} for l in lessons],
        "lessons_count": a.lessons_count, "rate": float(a.rate),
        "gross": float(a.gross), "income_tax": float(a.income_tax),
        "fszn": float(a.fszn), "net": float(a.net),
        "net_words": rub_words(to_k(a.net)),
    })


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def print_addendum(request, addendum_id):
    if not has_code(request.user, "documents.print"):
        raise RoleScopeError("Нет права documents.print")
    qs = Addendum.objects.select_related("contract__student")
    ids = scoped_student_ids(request.user)
    if ids is not None:
        qs = qs.filter(contract__student_id__in=ids)
    a = get_object_or_404(qs, pk=addendum_id)
    return Response({"number": a.number, "date": str(a.date), "body": a.body, "contract": _contract_ctx(a.contract)})


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def print_journal(request):
    if not has_code(request.user, "journal.view"):
        raise RoleScopeError("Нет права journal.view")
    group_id = request.query_params.get("group")
    if request.user.role == "teacher" and request.user.teacher_id:
        if group_id not in {str(x) for x in teacher_group_ids(request.user)}:
            raise RoleScopeError("Группа вне вашего scope")
    return Response(journal_payload(group_id, request.query_params.get("month"), request.user))


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def print_statement(request):
    if not has_code(request.user, "finance.view"):
        raise RoleScopeError("Нет права finance.view")
    sheet = get_object_or_404(StatementSheet, pk=request.query_params.get("sheet"))
    from apps.core.dates import server_today
    month = request.query_params.get("month") or str(server_today())[:7]
    rows = statement_rows(sheet, month)
    return Response({"month": month, "sheet": {"name": sheet.name, "address": sheet.address}, "rows": rows, "totals": statement_totals(rows)})


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def print_registry(request):
    if not has_code(request.user, "documents.print"):
        raise RoleScopeError("Нет права documents.print")
    qs = Student.objects.prefetch_related("contracts").all()
    ids = scoped_student_ids(request.user)
    if ids is not None:
        qs = qs.filter(id__in=ids)
    return Response({
        "students": [{
            "id": str(s.id), "name": str(s), "grade": s.grade, "school": s.school,
            "parent_name": s.parent_name, "parent_phone": s.parent_phone, "status": s.status,
            "contract": s.contracts.first().number if s.contracts.exists() else None,
        } for s in qs]
    })


# ---------- XLSX ----------

def _xlsx(filename, headers, rows):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    resp = HttpResponse(buf.read(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def statements_xlsx(request):
    if not has_code(request.user, "finance.view"):
        raise RoleScopeError("Нет права finance.view")
    sheet = get_object_or_404(StatementSheet, pk=request.query_params.get("sheet"))
    from apps.core.dates import server_today
    month = request.query_params.get("month") or str(server_today())[:7]
    rows = statement_rows(sheet, month, group_id=request.query_params.get("group"))
    audit(request.user, "export", "finance.statement", meta={"sheet": str(sheet.id), "month": month})
    return _xlsx(
        f"statement_{month}.xlsx",
        ["Ученик", "Класс", "Остаток на начало", "Оплачено", "Занятий", "Израсходовано", "Остаток на конец"],
        [[r["student"]["name"], r["student"]["grade"], r["opening"], r["paid"], r["consumedCount"], r["consumed"], r["closing"]] for r in rows],
    )


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def registry_xlsx(request):
    if not has_code(request.user, "documents.print"):
        raise RoleScopeError("Нет права documents.print")
    qs = Student.objects.prefetch_related("contracts").all()
    ids = scoped_student_ids(request.user)
    if ids is not None:
        qs = qs.filter(id__in=ids)
    audit(request.user, "export", "students.registry", meta={"count": qs.count()})
    return _xlsx(
        "registry.xlsx",
        ["ФИО", "Класс", "Школа", "Родитель", "Телефон", "Статус", "Договор"],
        [[str(s), s.grade, s.school, s.parent_name, s.parent_phone, s.status,
          s.contracts.first().number if s.contracts.exists() else ""] for s in qs],
    )
