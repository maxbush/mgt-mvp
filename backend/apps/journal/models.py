import uuid

from django.db import models


class Lesson(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey("groups.Group", on_delete=models.CASCADE, related_name="lessons")
    date = models.DateField()
    time = models.CharField(max_length=8, blank=True)
    topic = models.CharField(max_length=255, blank=True)
    substitute_teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.SET_NULL, related_name="substituted_lessons")
    cancelled = models.BooleanField(default=False)
    cancel_reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]
        constraints = [models.UniqueConstraint(fields=["group", "date"], name="uq_lesson_group_date")]
        indexes = [models.Index(fields=["date"]), models.Index(fields=["group", "date"])]

    @property
    def month(self):
        return self.date.strftime("%Y-%m")

    @property
    def effective_teacher_id(self):
        return self.substitute_teacher_id or (self.group.teacher_id if self.group_id else None)


class Attendance(models.Model):
    STATUS = [("present", "П"), ("absent", "Н"), ("sick", "Б"), ("excused", "У")]

    id = models.BigAutoField(primary_key=True)
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="marks")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="marks")
    status = models.CharField(max_length=16, choices=STATUS)
    comment = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey("core.User", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        unique_together = ("lesson", "student")
        indexes = [models.Index(fields=["lesson"]), models.Index(fields=["student"])]
