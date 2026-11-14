from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("branches", views.BranchViewSet, basename="branch")
router.register("directions", views.DirectionViewSet, basename="direction")
router.register("academic-years", views.AcademicYearViewSet, basename="academic-year")
router.register("signers", views.SignerViewSet, basename="signer")
router.register("statement-sheets", views.StatementSheetViewSet, basename="statement-sheet")
router.register("addendum-templates", views.AddendumTemplateViewSet, basename="addendum-template")
router.register("act-rates", views.ActRateViewSet, basename="act-rate")
router.register("charge-policies", views.ChargePolicyViewSet, basename="charge-policy")
router.register("tax-rates", views.TaxRateViewSet, basename="tax-rate")

urlpatterns = router.urls

from django.urls import path as _p

urlpatterns += [_p("settings/", views.SettingsView.as_view({"get": "list", "patch": "partial_update"}))]
