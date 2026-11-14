from django.urls import path

from .views import (
    AuditListView, CsrfView, DashboardView, HealthView, LoginView, LogoutView, MeView,
    PasswordResetConfirmView, PasswordResetRequestView, SearchView,
)

urlpatterns = [
    path("health", HealthView.as_view()),
    path("auth/csrf", CsrfView.as_view()),
    path("auth/login", LoginView.as_view()),
    path("auth/logout", LogoutView.as_view()),
    path("auth/me", MeView.as_view()),
    path("auth/password-reset", PasswordResetRequestView.as_view()),
    path("auth/password-reset/confirm", PasswordResetConfirmView.as_view()),
    path("audit/", AuditListView.as_view()),
    path("search", SearchView.as_view()),
    path("dashboard", DashboardView.as_view()),
]
