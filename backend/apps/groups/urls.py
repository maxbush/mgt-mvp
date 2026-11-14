from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("groups", views.GroupViewSet, basename="group")

urlpatterns = [path("enrollments/transfer", views.transfer_enrollment)] + router.urls
from django.urls import path as _p
from .views import enrollments_list, membership_list

urlpatterns += [_p("enrollments/", enrollments_list), _p("membership/", membership_list)]
