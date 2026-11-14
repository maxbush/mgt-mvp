from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views
from .bepaid import erip_verify, events_list, sync_bepaid, webhook

router = DefaultRouter()
router.register("payments", views.PaymentViewSet, basename="payment")
router.register("adjustments", views.AdjustmentViewSet, basename="adjustment")

urlpatterns = [
    path("statements", views.statements),
    path("months/", views.months_list),
    path("months/<str:month>/close", views.month_close),
    path("months/<str:month>/reopen", views.month_reopen),
    path("integrations/bepaid/webhook", webhook),
    path("integrations/bepaid/erip/account_verification", erip_verify),
    path("payments/sync-bepaid", sync_bepaid),
    path("integrations/events/", events_list),
] + router.urls
