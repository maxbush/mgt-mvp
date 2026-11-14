import csv
import io
from datetime import date as _date

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.audit import audit, audit_delete, audit_save
from apps.core.calc import from_k, split_even, to_k
from apps.core.errors import ConflictError, MonthClosedError, RoleScopeError
from apps.core.models import ImportBatch
from apps.core.permissions import HasCode, has_code
from apps.core.dates import server_today
from apps.dictionaries.models import StatementSheet
from apps.students.models import Student

from . import services as svc
from .models import Adjustment, MonthBalance, MonthClose, Payment, PaymentSplit
from .serializers import AdjustmentSerializer, MonthCloseSerializer, PaymentSerializer, PaymentWriteSerializer


def _check_month_open(month):
    if MonthClose.is_closed(month):
        raise MonthClosedError(f"Месяц {month} закрыт: правки запрещены. Администратор может открыть месяц.")


class PaymentViewSet(viewsets.ModelViewSet):
    required_code = "finance.edit"
    view_code = "finance.view"
    permission_classes = [HasCode]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = Payment.objects.select_related("student", "import_batch").prefetch_related("splits__student")
        for f in ("status", "method"):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        if self.request.query_params.get("month"):
            m = self.request.query_params["month"]
            qs = qs.filter(date__gte=f"{m}-01", date__lte=f"{m}-31")
        return qs

    def get_serializer_class(self):
        return PaymentSerializer if self.request.method == "GET" else PaymentWriteSerializer

    def perform_create(self, s):
        _check_month_open(str(s.validated_data["date"])[:7])
        obj = audit_save(self.request, s, "payment", save_kwargs={"created_by": self.request.user},
                         after={"amount": str(s.validated_data.get("amount")), "student": str(s.validated_data.get("student_id", ""))})

    def perform_destroy(self, obj):
        _check_month_open(str(obj.date)[:7])
        audit_delete(self.request, obj, "payment", before={"amount": str(obj.amount)})

    @action(detail=False, methods=["get"])
    def pending(self, request):
        qs = Payment.objects.filter(status="pending").order_by("-date")
        return Response(PaymentSerializer(qs, many=True).data)

    @action(detail=False, methods=["post"], url_path="import")
    def import_csv(self, request):
        """Импорт выписки BePaid CSV: дата;плательщик;сумма;ext_id

        dry_run=1 — только разбор и статистика без записи.
        """
        if not has_code(request.user, "payments.import"):
            raise RoleScopeError("Нет права payments.import")
        f = request.FILES.get("file")
        try:
            text = request.data.get("csv") or (f.read().decode("utf-8-sig") if f else "")
        except UnicodeDecodeError:
            raise ConflictError("Файл не является CSV в UTF-8")
        dry = request.data.get("dry_run") in ("1", "true", True)
        rows, bad = [], []
        for i, line in enumerate(csv.reader(io.StringIO(text), delimiter=";")):
            if not line or not any(x.strip() for x in line):
                continue
            if len(line) < 3:
                bad.append({"row": i + 1, "raw": line})
                continue
            d, payer, amount = line[0].strip(), line[1].strip(), line[2].strip().replace(",", ".").replace(" ", "")
            ext = line[3].strip() if len(line) > 3 else ""
            try:
                _date.fromisoformat(d)
                float(amount)
            except ValueError:
                if i == 0:  # вероятно заголовок
                    continue
                bad.append({"row": i + 1, "raw": line})
                continue
            rows.append({"date": d, "payer": payer, "amount": amount, "ext_id": ext})
        # Платежи в закрытый месяц запрещены — иначе сломают зафиксированные остатки.
        closed_rows = [r for r in rows if MonthClose.is_closed(r["date"][:7])]
        rows = [r for r in rows if r not in closed_rows]
        existing = set(Payment.objects.filter(ext_id__in=[r["ext_id"] for r in rows if r["ext_id"]]).values_list("ext_id", flat=True))
        res = {"loaded": len(rows), "auto": 0, "queued": 0, "dups": 0, "bad": len(bad), "bad_rows": bad[:20], "closed_month": len(closed_rows), "created": []}
        if dry:
            res["dups"] = sum(1 for r in rows if r["ext_id"] and r["ext_id"] in existing)
            return Response(res)
        with transaction.atomic():
            batch = ImportBatch.objects.create(user=request.user, file_name=getattr(f, "name", ""), rows=len(rows), rejected=len(bad) + len(closed_rows))
            for r in rows:
                if r["ext_id"] and r["ext_id"] in existing:
                    res["dups"] += 1
                    continue
                if r["ext_id"]:
                    existing.add(r["ext_id"])  # дедуп и внутри одного файла
                match = svc.exact_student_matches(r["payer"])
                p = Payment.objects.create(
                    date=r["date"], payer=r["payer"], amount=r["amount"], ext_id=r["ext_id"],
                    method="bepaid", import_batch=batch, created_by=request.user,
                    status="confirmed" if len(match) == 1 else "pending",
                    student=match[0] if len(match) == 1 else None,
                )
                if p.status == "confirmed":
                    res["auto"] += 1
                else:
                    res["queued"] += 1
                res["created"].append(str(p.id))
            batch.auto_matched, batch.queued, batch.duplicates = res["auto"], res["queued"], res["dups"]
            batch.save(update_fields=["auto_matched", "queued", "duplicates"])
            audit(request.user, "import", "finance.payment", meta={"batch": str(batch.id), **{k: res[k] for k in ("loaded", "auto", "queued", "dups", "bad")}})
        return Response(res, status=201)

    @action(detail=True, methods=["get"])
    def candidates(self, request, pk=None):
        p = self.get_object()
        return Response(svc.payment_candidates(p.payer))

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        """Подтвердить сопоставление: {student_id}. Только из pending."""
        p = self.get_object()
        if p.status != "pending":
            raise ConflictError(f"Платёж уже обработан (status={p.status}) — сначала requeue")
        _check_month_open(str(p.date)[:7])
        st = get_object_or_404(Student, pk=request.data.get("student_id"))
        with transaction.atomic():
            p.student, p.status = st, "confirmed"
            p.save(update_fields=["student", "status"])
            audit(request.user, "payment", "finance.payment", p.pk, after={"status": "confirmed", "student": str(st.id)})
        return Response(PaymentSerializer(p).data)

    @action(detail=True, methods=["post"])
    def split(self, request, pk=None):
        """Разделить платёж: {parts: [{student_id, amount}]} — сумма частей = сумме платежа."""
        p = self.get_object()
        if p.status != "pending":
            raise ConflictError(f"Платёж уже обработан (status={p.status}) — сначала requeue")
        _check_month_open(str(p.date)[:7])
        parts = request.data.get("parts", [])
        if len(parts) < 2:
            raise ConflictError("Сплит: нужно минимум две части")
        total_k = sum(to_k(x["amount"]) for x in parts)
        if total_k != to_k(p.amount):
            raise ConflictError(f"Сумма частей ({from_k(total_k)}) не равна сумме платежа ({p.amount})")
        with transaction.atomic():
            p.splits.all().delete()
            for x in parts:
                PaymentSplit.objects.create(payment=p, student_id=x["student_id"], amount=x["amount"])
            p.student, p.status = None, "confirmed"
            p.save(update_fields=["student", "status"])
            audit(request.user, "payment", "finance.payment", p.pk, after={"status": "split", "parts": parts})
        return Response(PaymentSerializer(p).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        p = self.get_object()
        if p.status != "pending":
            raise ConflictError(f"Платёж уже обработан (status={p.status}) — сначала requeue")
        _check_month_open(str(p.date)[:7])
        with transaction.atomic():
            p.status = "rejected"
            p.reject_reason = request.data.get("reason", "")
            p.save(update_fields=["status", "reject_reason"])
            audit(request.user, "payment", "finance.payment", p.pk, after={"status": "rejected"})
        return Response(PaymentSerializer(p).data)

    @action(detail=True, methods=["post"])
    def requeue(self, request, pk=None):
        p = self.get_object()
        _check_month_open(str(p.date)[:7])
        with transaction.atomic():
            p.status, p.student = "pending", None
            p.splits.all().delete()
            p.save(update_fields=["status", "student"])
            audit(request.user, "payment", "finance.payment", p.pk, after={"status": "pending"})
        return Response(PaymentSerializer(p).data)


class AdjustmentViewSet(viewsets.ModelViewSet):
    queryset = Adjustment.objects.select_related("student")
    serializer_class = AdjustmentSerializer
    required_code = "finance.edit"
    view_code = "finance.view"
    permission_classes = [HasCode]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def perform_create(self, s):
        _check_month_open(str(s.validated_data["date"])[:7])
        obj = audit_save(self.request, s, "payment", save_kwargs={"created_by": self.request.user},
                         after={"amount": str(s.validated_data.get("amount"))})

    def perform_destroy(self, obj):
        _check_month_open(str(obj.date)[:7])
        audit_delete(self.request, obj, "payment", before={"amount": str(obj.amount)})


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def statements(request):
    """GET /statements?sheet=&month=&group=&debt_only="""
    if not has_code(request.user, "finance.view"):
        raise RoleScopeError("Нет права finance.view")
    sheet = get_object_or_404(StatementSheet, pk=request.query_params.get("sheet"))
    month = request.query_params.get("month") or str(server_today())[:7]
    rows = svc.statement_rows(sheet, month, group_id=request.query_params.get("group"), debt_only=request.query_params.get("debt_only") in ("1", "true"))
    return Response({"month": month, "sheet": {"id": str(sheet.id), "name": sheet.name, "address": sheet.address}, "rows": rows, "totals": svc.statement_totals(rows)})


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
def months_list(request):
    if not has_code(request.user, "finance.view"):
        raise RoleScopeError("Нет права finance.view")
    return Response(list(MonthClose.objects.values("month", "closed_at", "reopened_at", "reopen_reason").order_by("-month")))


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
def month_close(request, month):
    """POST /months/{YYYY-MM}/close — снимки остатков + предупреждения."""
    if not has_code(request.user, "month.close"):
        raise RoleScopeError("Нет права month.close")
    if MonthClose.is_closed(month):
        raise ConflictError(f"Месяц {month} уже закрыт")
    from apps.journal.services import unmarked_past_lessons

    with transaction.atomic():
        mc = MonthClose.objects.create(month=month, closed_by=request.user)
        for st in Student.objects.filter(status="active"):
            r = svc.balance_row(st.id, month)
            MonthBalance.objects.create(
                month_close=mc, student=st,
                opening=r["opening"], paid=r["paid"], charged=r["consumed"], closing=r["closing"],
            )
        unmarked = len(unmarked_past_lessons(month))
        unmatched = Payment.objects.filter(status="pending", date__lte=f"{month}-31").count()
        audit(request.user, "month", "finance.month_close", mc.pk, after={"month": month})
    return Response({"month": month, "closed": True, "warnings": {"unmarked_lessons": unmarked, "unmatched_payments": unmatched}})


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
def month_reopen(request, month):
    """POST /months/{YYYY-MM}/reopen {reason} — только admin, обязательная причина."""
    if not has_code(request.user, "month.close"):
        raise RoleScopeError("Нет права month.close")
    reason = (request.data.get("reason") or "").strip()
    if not reason:
        raise ConflictError("Для открытия месяца обязательна причина")
    mc = get_object_or_404(MonthClose, month=month, reopened_at__isnull=True)
    with transaction.atomic():
        from django.utils.timezone import now

        mc.reopened_at, mc.reopened_by, mc.reopen_reason = now(), request.user, reason
        mc.save(update_fields=["reopened_at", "reopened_by", "reopen_reason"])
        audit(request.user, "month", "finance.month_close", mc.pk, after={"month": month, "reopened": True, "reason": reason})
    return Response({"month": month, "closed": False})
