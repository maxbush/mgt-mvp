import uuid

from django.db import models


class Branch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=64, blank=True)
    address = models.CharField(max_length=255, blank=True)
    color = models.CharField(max_length=16, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Direction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=16, unique=True)
    name = models.CharField(max_length=128)

    def __str__(self):
        return self.name


class AcademicYear(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=32)  # «2025/2026»
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    @classmethod
    def current(cls):
        return cls.objects.filter(is_current=True).first() or cls.objects.order_by("-start_date").first()

    def __str__(self):
        return self.name


class Signer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128)
    position = models.CharField(max_length=255)
    position_gen = models.CharField(max_length=255, blank=True)
    female = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} — {self.position}"


class StatementSheet(models.Model):
    """Листы ведомости. kind=branch → по филиалу (без IT); kind=direction → по направлению."""
    KINDS = [("branch", "Филиал"), ("direction", "Направление"), ("custom", "Произвольный")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=16, choices=KINDS, default="branch")
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=255, blank=True)
    branch = models.ForeignKey(Branch, null=True, blank=True, on_delete=models.CASCADE)
    direction = models.ForeignKey(Direction, null=True, blank=True, on_delete=models.CASCADE)
    group_ids = models.JSONField(default=list, blank=True)  # для kind=custom
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "name"]


class ActRate(models.Model):
    """Ставка за занятие в акте преподавателя (с даты)."""
    id = models.BigAutoField(primary_key=True)
    date_from = models.DateField()
    rate = models.DecimalField(max_digits=8, decimal_places=2)
    teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.CASCADE, related_name="act_rates")

    class Meta:
        ordering = ["date_from"]


class ChargePolicy(models.Model):
    """Политика списаний по статусам посещаемости (с даты)."""
    id = models.BigAutoField(primary_key=True)
    date_from = models.DateField()
    charge_absent = models.BooleanField(default=True)
    charge_sick = models.BooleanField(default=False)
    charge_excused = models.BooleanField(default=False)

    class Meta:
        ordering = ["date_from"]

    @classmethod
    def on(cls, date_str):
        return cls.objects.filter(date_from__lte=date_str).order_by("-date_from").first() or cls(date_from="2000-01-01")


class TaxRate(models.Model):
    id = models.BigAutoField(primary_key=True)
    kind = models.CharField(max_length=16)  # income_tax / fszn
    date_from = models.DateField()
    pct = models.DecimalField(max_digits=5, decimal_places=2)

    @classmethod
    def on(cls, kind, date_str):
        e = cls.objects.filter(kind=kind, date_from__lte=date_str).order_by("-date_from").first()
        return e.pct if e else None


class SystemSetting(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    value = models.JSONField()

    @classmethod
    def get(cls, key, default=None):
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default

    @classmethod
    def set(cls, key, value):
        cls.objects.update_or_create(key=key, defaults={"value": value})


class AddendumTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128)
    clause = models.CharField(max_length=128, blank=True)
    body = models.TextField()  # с плейсхолдерами {{contract_number}} и т.п.
    is_active = models.BooleanField(default=True)
