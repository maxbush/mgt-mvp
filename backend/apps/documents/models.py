import uuid

from django.db import models


class Addendum(models.Model):
    """Дополнительное соглашение к договору."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contract = models.ForeignKey("students.Contract", on_delete=models.CASCADE, related_name="addendums")
    number = models.CharField(max_length=32)
    date = models.DateField()
    template = models.ForeignKey("dictionaries.AddendumTemplate", null=True, blank=True, on_delete=models.SET_NULL)
    body = models.TextField()  # итоговый текст после подстановки
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey("core.User", null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["-date"]
