import uuid

from django.db import models


class Group(models.Model):
    STATUS = [("active", "Активна"), ("archived", "Архив")]
    DIRECTIONS = [("electronics", "Электроника"), ("robotics", "Робототехника"), ("it", "IT"), ("other", "Другое")]
    DIRECTION_LABELS = dict(DIRECTIONS)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=32)  # «Э-1», «Р-2», «IT-1»
    name = models.CharField(max_length=128)  # «Юный электронщик»
    direction = models.CharField(max_length=16, choices=DIRECTIONS)
    branch = models.ForeignKey("dictionaries.Branch", on_delete=models.PROTECT, related_name="groups")
    academic_year = models.ForeignKey("dictionaries.AcademicYear", null=True, blank=True, on_delete=models.SET_NULL, related_name="groups")
    teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.SET_NULL, related_name="groups")
    room = models.CharField(max_length=64, blank=True)
    capacity = models.IntegerField(default=12)
    schedule = models.CharField(max_length=128, blank=True)  # «пн/чт 17:00»
    weekdays = models.JSONField(default=list, blank=True)  # [1,4] — для генерации занятий
    lesson_time = models.CharField(max_length=16, blank=True)  # «17:00»
    status = models.CharField(max_length=16, choices=STATUS, default="active")

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name}"

    def price_on(self, date_str):
        from apps.core.calc import price_on

        return price_on([{"from": p.date_from.isoformat(), "price": p.price} for p in self.prices.all()], date_str)


class GroupPrice(models.Model):
    """Цена занятия в группе с даты действия."""

    id = models.BigAutoField(primary_key=True)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="prices")
    date_from = models.DateField()
    price = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        ordering = ["date_from"]
        unique_together = ("group", "date_from")


class Enrollment(models.Model):
    """Членство ученика в группе на интервале дат [from, to)."""

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="enrollments")
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="enrollments")
    date_from = models.DateField(db_column="from")
    date_to = models.DateField(null=True, blank=True, db_column="to")

    class Meta:
        ordering = ["date_from"]
        indexes = [models.Index(fields=["student", "group", "date_from", "date_to"])]

    def __str__(self):
        return f"{self.student} → {self.group_id}"


class MembershipChange(models.Model):
    KINDS = [("enroll", "Зачислен"), ("unenroll", "Отчислен"), ("transfer", "Перевод")]

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="membership_changes")
    kind = models.CharField(max_length=16, choices=KINDS)
    from_group = models.ForeignKey(Group, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    to_group = models.ForeignKey(Group, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    date = models.DateField()
    comment = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey("core.User", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-date", "-id"]
