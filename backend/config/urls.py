from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema")),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.dictionaries.urls")),
    path("api/v1/", include("apps.students.urls")),
    path("api/v1/", include("apps.groups.urls")),
    path("api/v1/", include("apps.journal.urls")),
    path("api/v1/", include("apps.finance.urls")),
    path("api/v1/", include("apps.staff.urls")),
    path("api/v1/", include("apps.documents.urls")),
]
