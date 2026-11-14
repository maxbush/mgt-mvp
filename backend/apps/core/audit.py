"""Запись в журнал аудита. Вызывать внутри transaction.atomic()."""
from .models import AuditLog


def audit(user, action, entity, entity_id="", before=None, after=None, meta=None):
    return AuditLog.objects.create(
        user=user if getattr(user, "is_authenticated", False) else None,
        action=action, entity=entity, entity_id=str(entity_id or ""),
        before=before, after=after, meta=meta,
    )
