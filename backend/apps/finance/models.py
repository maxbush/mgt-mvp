import uuid

from django.db import models


class Payment(models.Model):
    METHODS = [("bepaid", "BePaid"), ("erip", "ЕРИП"), ("card", "Карта"), ("cash", "Наличные"), ("manual", "Вручную")]
    STATUS = [("confirmed", "Подтверждён"), ("pending", "На сопоставлении"), ("rejected", "Отклонён")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey("students.Student", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=16, choices=METHODS, default="manual")
    status = models.CharField(max_length=16, choices=STATUS, default="confirmed")
    payer = models.CharField(max_length=128, blank=True)      # плательщик из выписки
    ext_id = models.CharField(max_length=64, blank=True, db_index=True)  # дедуп по внешнему id
    note = models.CharField(max_length=255, blank=True)
    comment = models.CharField(max_length=255, blank=True)
    reject_reason = models.CharField(max_length=255, blank=True)
    import_batch = models.ForeignKey("core.ImportBatch", null=True, blank=True, on_delete=models.SET_NULL, related_name="payments")
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey("core.User", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-date"]
        indexes = [models.Index(fields=["status"]), models.Index(fields=["student", "date"])]


class PaymentSplit(models.Model):
    """Часть сплитованного платежа (один платёж родителя за нескольких детей)."""

    id = models.BigAutoField(primary_key=True)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="splits")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="payment_splits")
    amount = models.DecimalField(max_digits=12, decimal_places=2)


class Adjustment(models.Model):
    """Ручная корректировка баланса (списание/начисление)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="adjustments")
    date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # знак: + пополнение / − списание
    comment = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey("core.User", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["date"]


class MonthClose(models.Model):
    """Закрытие месяца. opened=month, reopened_at — если переоткрыт."""

    id = models.BigAutoField(primary_key=True)
    month = models.CharField(max_length=7, unique=True)  # YYYY-MM
    closed_at = models.DateTimeField(auto_now_add=True)
    closed_by = models.ForeignKey("core.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reopened_at = models.DateTimeField(null=True, blank=True)
    reopened_by = models.ForeignKey("core.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reopen_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["month"]

    @classmethod
    def closed_months(cls):
        return set(cls.objects.filter(reopened_at__isnull=True).values_list("month", flat=True))

    @classmethod
    def is_closed(cls, month):
        return cls.objects.filter(month=month, reopened_at__isnull=True).exists()


class MonthBalance(models.Model):
    """Снимок остатков учеников на конец закрытого месяца."""

    id = models.BigAutoField(primary_key=True)
    month_close = models.ForeignKey(MonthClose, on_delete=models.CASCADE, related_name="balances")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE)
    opening = models.DecimalField(max_digits=12, decimal_places=2)
    paid = models.DecimalField(max_digits=12, decimal_places=2)
    charged = models.DecimalField(max_digits=12, decimal_places=2)
    closing = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        unique_together = ("month_close", "student")
