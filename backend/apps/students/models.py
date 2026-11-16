import uuid

from django.db import models


class Student(models.Model):
    STATUS = [("active", "Активен"), ("inactive", "Выбыл")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    last_name = models.CharField(max_length=64)
    first_name = models.CharField(max_length=64)
    middle_name = models.CharField(max_length=64, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    birth_year = models.IntegerField(null=True, blank=True)
    grade = models.CharField(max_length=8, blank=True)          # «5А»
    school = models.CharField(max_length=255, blank=True)
    parent_name = models.CharField(max_length=128, blank=True)  # ФИО родителя
    parent_phone = models.CharField(max_length=32, blank=True)
    parent_phone2 = models.CharField(max_length=32, blank=True)
    parent_email = models.EmailField(blank=True)
    comment = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=STATUS, default="active")
    branch = models.ForeignKey("dictionaries.Branch", null=True, blank=True, on_delete=models.SET_NULL, related_name="students")
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.last_name} {self.first_name}".strip()

    def contract_state(self, today=None):
        """none — договоров нет; expired — есть, но все просрочены/закрыты; active — действующий.

        Просроченный договор не блокирует списания (тариф применяется последний),
        но состояние флажится в ведомости и карточке ученика.
        """
        from apps.core.dates import server_today

        t = today or server_today()
        ts = t.isoformat() if hasattr(t, "isoformat") else str(t)
        any_contracts = False
        for c in self.contracts.all():
            any_contracts = True
            if c.status != "active":
                continue
            until = c.effective_valid_until()
            if until is None or until.isoformat() >= ts:
                return "active"
        return "expired" if any_contracts else "none"


class Contract(models.Model):
    STATUS = [("active", "Действует"), ("closed", "Закрыт"), ("terminated", "Расторгнут")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="contracts")
    academic_year = models.ForeignKey("dictionaries.AcademicYear", on_delete=models.PROTECT, related_name="contracts")
    number = models.CharField(max_length=32)
    number_norm = models.CharField(max_length=32, db_index=True)  # нормализованный: нижн.регистр, без пробелов, lat→cyr
    date = models.DateField()
    status = models.CharField(max_length=16, choices=STATUS, default="active")
    closed_at = models.DateField(null=True, blank=True)
    tariff = models.ForeignKey("dictionaries.PriceItem", null=True, blank=True, on_delete=models.SET_NULL, related_name="contracts")
    valid_until = models.DateField(null=True, blank=True)
    comment = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["academic_year", "number_norm"], name="uq_contract_number_year"),
        ]

    def effective_valid_until(self):
        """Срок действия с учётом допников-продлений: позднейшая дата выигрывает."""
        until = self.valid_until
        for a in self.addendums.all():
            if a.new_valid_until and (until is None or a.new_valid_until > until):
                until = a.new_valid_until
        return until

    def save(self, *a, **kw):
        from apps.core.calc import norm_contract_no

        self.number_norm = norm_contract_no(self.number)
        super().save(*a, **kw)
