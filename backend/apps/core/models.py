import uuid

from django.contrib.auth.models import AbstractUser, Group
from django.db import models


class User(AbstractUser):
    """Пользователь CRM. Роль — через Django Group (admin/teacher/accountant/director).

    teacher → связь с преподавателем (scope «только свои группы»).
    """
    ROLE_CHOICES = [("admin", "Администратор"), ("teacher", "Преподаватель"), ("accountant", "Бухгалтер"), ("director", "Директор")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default="admin")
    teacher = models.ForeignKey("staff.Teacher", null=True, blank=True, on_delete=models.SET_NULL, related_name="users")

    @property
    def role_group(self):
        return self.groups.first()


class RolePermission(models.Model):
    """Матрица роль×право: список кодов прав, привязанных к Django Group (роли)."""
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="role_permissions")
    codename = models.CharField(max_length=64)

    class Meta:
        unique_together = ("group", "codename")


class AuditLog(models.Model):
    """Журнал аудита: кто/когда/что изменил (п. 4.14 ТЗ)."""
    ACTIONS = [
        ("create", "create"), ("update", "update"), ("delete", "delete"), ("status", "status"),
        ("attendance", "attendance"), ("payment", "payment"), ("settings", "settings"),
        ("membership", "membership"), ("generate", "generate"), ("import", "import"),
        ("auth", "auth"), ("month", "month"), ("act", "act"), ("view_sensitive", "view_sensitive"),
        ("export", "export"), ("integration", "integration"),
    ]

    id = models.BigAutoField(primary_key=True)
    at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=24, choices=ACTIONS)
    entity = models.CharField(max_length=48)
    entity_id = models.CharField(max_length=64, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    meta = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-at"]
        indexes = [models.Index(fields=["entity", "entity_id"]), models.Index(fields=["action", "at"])]


class ImportBatch(models.Model):
    """Пакет импорта (выписка BePaid CSV / будущий sync)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source = models.CharField(max_length=24, default="bepaid_csv")
    file_name = models.CharField(max_length=255, blank=True)
    at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    rows = models.IntegerField(default=0)
    auto_matched = models.IntegerField(default=0)
    queued = models.IntegerField(default=0)
    duplicates = models.IntegerField(default=0)
    rejected = models.IntegerField(default=0)


class IntegrationEvent(models.Model):
    """События интеграций (bePaid webhook / Reports API / ERIP)."""
    STATUS = [("new", "new"), ("processed", "processed"), ("failed", "failed"), ("skipped", "skipped")]
    id = models.BigAutoField(primary_key=True)
    provider = models.CharField(max_length=24, default="bepaid")
    event_type = models.CharField(max_length=64)
    ext_id = models.CharField(max_length=128, blank=True)
    payload = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS, default="new")
    error = models.TextField(blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-received_at"]
        indexes = [models.Index(fields=["provider", "ext_id"])]
