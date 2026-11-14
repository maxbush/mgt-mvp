from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("students", views.StudentViewSet, basename="student")
router.register("contracts", views.ContractViewSet, basename="contract")

urlpatterns = router.urls
