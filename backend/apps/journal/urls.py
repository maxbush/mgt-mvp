from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("lessons", views.LessonViewSet, basename="lesson")

urlpatterns = [
    path("journal", views.journal),
    path("journal/unmarked", views.journal_unmarked),
    path("marks", views.marks_map),
    path("groups/<uuid:group_id>/generate-lessons/", views.generate_lessons),
] + router.urls
