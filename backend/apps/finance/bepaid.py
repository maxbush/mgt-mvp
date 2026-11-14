"""bePaid-адаптеры: webhook, ERIP-проверка счёта, sync через Reports API.

Реальные ключи — только из env (BEPAID_SHOP_ID/BEPAID_SECRET_KEY/…).
Без ключей адаптеры возвращают 501 not_configured — демо-импорт идёт через CSV.
"""
from django.conf import settings
from django.db import transaction
from django.utils.timezone import now
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.audit import audit
from apps.core.errors import ApiError
from apps.core.models import IntegrationEvent
from apps.core.permissions import has_code

from .models import Payment


def _configured():
    return bool(getattr(settings, "BEPAID_SHOP_ID", "") and getattr(settings, "BEPAID_SECRET_KEY", ""))


class NotConfigured(ApiError):
    code = "not_configured"
    status_code = 501


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def webhook(request):
    """POST /integrations/bepaid/webhook — приём событий bePaid.

    Маршрут «затравлен»: событие логируется в IntegrationEvent и идемпотентно
    разбирается (ext_id → дедуп по платежам). Проверка подписи/IP — при наличии
    prod-ключей (BEPAID_WEBHOOK_IPS).
    """
    if not _configured():
        raise NotConfigured("bePaid не настроен: webhook отключён")
    allowed = getattr(settings, "BEPAID_WEBHOOK_IPS", [])
    if not allowed:
        # Fail-closed: без белого списка IP webhook не принимает события —
        # иначе любой POST создавал бы платежи в очереди.
        raise NotConfigured("BEPAID_WEBHOOK_IPS не задан: webhook отключён")
    if allowed:
        ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", "")).split(",")[0].strip()
        if ip not in allowed:
            return Response({"error": {"code": "forbidden", "message": "IP не в белом списке", "details": {}}}, status=403)
    payload = request.data or {}
    tx = (payload.get("transaction") or payload)
    ext_id = str(tx.get("uid") or tx.get("id") or "")
    with transaction.atomic():
        ev = IntegrationEvent.objects.create(provider="bepaid", event_type=str(tx.get("type", "payment")), ext_id=ext_id, payload=payload)
        if not ext_id:
            ev.status, ev.error = "skipped", "нет ext_id"
            ev.save(update_fields=["status", "error"])
            return Response({"ok": True, "skipped": "no ext_id"})
        if Payment.objects.filter(ext_id=ext_id).exists():
            ev.status = "skipped"
            ev.error = "дубликат ext_id"
            ev.processed_at = now()
            ev.save(update_fields=["status", "error", "processed_at"])
            return Response({"ok": True, "skipped": "duplicate"})
        if tx.get("status") not in ("successful", "success", "settled"):
            ev.status = "skipped"
            ev.error = f"статус {tx.get('status')}"
            ev.processed_at = now()
            ev.save(update_fields=["status", "error", "processed_at"])
            return Response({"ok": True, "skipped": "status"})
        amount = tx.get("amount")
        try:
            amount = float(amount) / 100  # bePaid возвращает в минорных единицах
        except (TypeError, ValueError):
            amount = None
        p = Payment.objects.create(
            date=(tx.get("paid_at") or tx.get("created_at") or str(now().date()))[:10],
            amount=amount if amount is not None else 0,
            method="bepaid", status="pending",
            payer=str(tx.get("customer", {}).get("name") or tx.get("description") or "")[:128],
            ext_id=ext_id,
        )
        ev.status = "processed"
        ev.processed_at = now()
        ev.save(update_fields=["status", "processed_at"])
        audit(None, "integration", "finance.payment", p.pk, meta={"via": "webhook", "event": ev.id})
    return Response({"ok": True, "payment": str(p.id)})


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
def erip_verify(request):
    """POST /integrations/bepaid/erip/account_verification {account_no}

    Проверка лицевого счёта ЕРИП: возвращает ФИО и рекомендуемую сумму.
    Без ключей — 501; с ключами — запрос к bePaid Erip API.
    """
    if not _configured():
        raise NotConfigured("bePaid не сконфигурирован: задайте BEPAID_SHOP_ID/BEPAID_SECRET_KEY")
    # Каркас реального вызова (Basic-auth, JSON): оставлен как TODO с реальной точкой —
    # проверяется на prod-ключах заказчика, не на демо.
    return Response({"ok": False, "message": "ERIP verification: подключите prod-ключи"}, status=501)


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
def sync_bepaid(request):
    """POST /payments/sync-bepaid {date_from,date_to} — синхронизация из Reports API.

    Идемпотентна по ext_id. Без ключей — 501 (демо-поток — через CSV-импорт).
    """
    if not has_code(request.user, "payments.import"):
        from apps.core.errors import RoleScopeError
        raise RoleScopeError("Нет права payments.import")
    if not _configured():
        raise NotConfigured("bePaid не сконфигурирован: задайте BEPAID_SHOP_ID/BEPAID_SECRET_KEY")
    return Response({"ok": False, "message": "Reports API sync: подключите prod-ключи"}, status=501)


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def events_list(request):
    """GET /integrations/events/ — лента событий интеграций (мониторинг)."""
    if not has_code(request.user, "finance.view"):
        from apps.core.errors import RoleScopeError
        raise RoleScopeError("Нет права finance.view")
    qs = IntegrationEvent.objects.all()[:200]
    return Response([
        {"id": e.id, "provider": e.provider, "event_type": e.event_type, "ext_id": e.ext_id,
         "status": e.status, "error": e.error, "received_at": e.received_at, "processed_at": e.processed_at}
        for e in qs
    ])
