from django.urls import path

from . import views

urlpatterns = [
    path("health", views.HealthView.as_view()),
    path("auth/csrf", views.CsrfView.as_view()),
    path("auth/login", views.LoginView.as_view()),
    path("auth/logout", views.LogoutView.as_view()),
    path("auth/me", views.MeView.as_view()),
    path("auth/password-reset", views.PasswordResetRequestView.as_view()),
    path("auth/password-reset/confirm", views.PasswordResetRequestView.as_view()),
    path("audit/", views.AuditListView.as_view()),
    path("search", views.SearchView.as_view()),
]
from django.urls import path as _p
from .views import DashboardView

urlpatterns += [_p("dashboard", DashboardView.as_view())]
