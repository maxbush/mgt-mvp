from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("groups", views.GroupViewSet, basename="group")

urlpatterns = [
    path("enrollments/", views.enrollments_list),
    path("enrollments/transfer", views.transfer_enrollment),
    path("membership/", views.membership_list),
] + router.urls
