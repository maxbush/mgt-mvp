from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("teachers", views.TeacherViewSet, basename="teacher")
router.register("acts", views.ActViewSet, basename="act")

urlpatterns = router.urls
