from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("lessons", views.LessonViewSet, basename="lesson")

urlpatterns = [
    path("journal", views.journal),
    path("journal/unmarked", views.journal_unmarked),
    path("groups/<uuid:group_id>/generate-lessons/", views.generate_lessons),
] + router.urls
from django.urls import path as _p
from .views import marks_map

urlpatterns += [_p("marks", marks_map)]
