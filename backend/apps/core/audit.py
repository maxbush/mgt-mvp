"""Запись в журнал аудита. Вызывать внутри transaction.atomic()."""
from django.db import transaction

from .models import AuditLog


def audit(user, action, entity, entity_id="", before=None, after=None, meta=None):
    return AuditLog.objects.create(
        user=user if getattr(user, "is_authenticated", False) else None,
        action=action, entity=entity, entity_id=str(entity_id or ""),
        before=before, after=after, meta=meta,
    )


def audit_save(request, serializer, action, save_kwargs=None, **kw):
    """serializer.save() + аудит в одной транзакции; entity — label_lower модели.

    after/before могут быть callable — вычисляются после save()
    (serializer.data доступен только после сохранения).
    """
    with transaction.atomic():
        obj = serializer.save(**(save_kwargs or {}))
        kw = {k: (v(obj) if callable(v) else v) for k, v in kw.items()}
        audit(request.user, action, obj._meta.label_lower, obj.pk, **kw)
    return obj


def audit_delete(request, obj, action="delete", **kw):
    """obj.delete() + аудит в одной транзакции."""
    with transaction.atomic():
        eid, entity = obj.pk, obj._meta.label_lower
        obj.delete()
        audit(request.user, action, entity, eid, **kw)
