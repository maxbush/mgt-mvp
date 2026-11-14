import uuid

from django.db import models

from apps.core.fields import EncryptedTextField


class Teacher(models.Model):
    STATUS = [("active", "Работает"), ("inactive", "Уволен")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    last_name = models.CharField(max_length=64)
    first_name = models.CharField(max_length=64)
    middle_name = models.CharField(max_length=64, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    status = models.CharField(max_length=16, choices=STATUS, default="active")
    # чувствительные поля — шифруются Fernet (п. 4.13 ТЗ: перс. данные преподавателей)
    passport_series = EncryptedTextField(blank=True)
    passport_number = EncryptedTextField(blank=True)
    passport_issued = EncryptedTextField(blank=True)
    passport_date = models.DateField(null=True, blank=True)
    personal_number = EncryptedTextField(blank=True)
    iban = EncryptedTextField(blank=True)
    bank_name = models.CharField(max_length=128, blank=True)
    bank_bic = models.CharField(max_length=16, blank=True)
    address_reg = EncryptedTextField(blank=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.last_name} {self.first_name}".strip()


class Act(models.Model):
    """Акт выполненных работ преподавателя за месяц."""

    STATUS = [("draft", "Черновик"), ("signed", "Подписан")]
    SOURCE = [("journal", "Из журнала"), ("manual", "Вручную")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=32)
    teacher = models.ForeignKey(Teacher, on_delete=models.PROTECT, related_name="acts")
    month = models.CharField(max_length=7)  # YYYY-MM
    lessons_count = models.IntegerField()
    rate = models.DecimalField(max_digits=8, decimal_places=2)
    gross = models.DecimalField(max_digits=12, decimal_places=2)
    income_tax = models.DecimalField(max_digits=12, decimal_places=2)
    fszn = models.DecimalField(max_digits=12, decimal_places=2)
    net = models.DecimalField(max_digits=12, decimal_places=2)
    signer = models.ForeignKey("dictionaries.Signer", null=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=16, choices=STATUS, default="draft")
    source = models.CharField(max_length=16, choices=SOURCE, default="journal")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-month", "teacher__last_name"]
        unique_together = ("teacher", "month", "number")
