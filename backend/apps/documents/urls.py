from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("addendums", views.AddendumViewSet, basename="addendum")

urlpatterns = [
    path("statements/export.xlsx", views.statements_xlsx),
    path("registry/export.xlsx", views.registry_xlsx),
    path("print-data/act/<uuid:act_id>", views.print_act),
    path("print-data/addendum/<uuid:addendum_id>", views.print_addendum),
    path("print-data/journal", views.print_journal),
    path("print-data/statement", views.print_statement),
    path("print-data/registry", views.print_registry),
] + router.urls
