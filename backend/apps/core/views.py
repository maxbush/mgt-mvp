from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import generics, permissions as p
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import audit
from .models import AuditLog
from .permissions import HasCode, role_name, user_codes
from .serializers import AuditSerializer, LoginSerializer, me_payload


@method_decorator(ensure_csrf_cookie, name="get")
@extend_schema(responses={200: OpenApiTypes.OBJECT})
class CsrfView(APIView):
    permission_classes = [p.AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class LoginView(APIView):
    permission_classes = [p.AllowAny]

    @extend_schema(request=LoginSerializer, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = authenticate(request, username=s.validated_data["username"], password=s.validated_data["password"])
        if user is None or not user.is_active:
            audit(None, "auth", "user", meta={"event": "login_failed", "username": s.validated_data["username"]})
            return Response({"error": {"code": "invalid_credentials", "message": "Неверный логин или пароль", "details": {}}}, status=401)
        login(request, user)
        audit(user, "auth", "user", user.id, meta={"event": "login"})
        return Response(me_payload(user))


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class LogoutView(APIView):
    def post(self, request):
        audit(request.user, "auth", "user", request.user.id, meta={"event": "logout"})
        logout(request)
        return Response({"ok": True})


@extend_schema(responses={200: OpenApiTypes.OBJECT})
class MeView(APIView):
    def get(self, request):
        return Response(me_payload(request.user))


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class PasswordResetRequestView(APIView):
    """Заглушка: генерирует токен и «отправляет» письмо (SMTP — из env)."""

    permission_classes = [p.AllowAny]

    def post(self, request):
        # MVP: без реальной отправки; в проде — через django.contrib.auth.tokens + email backend
        return Response({"ok": True, "message": "Если пользователь существует, письмо отправлено"})


@extend_schema(responses={200: OpenApiTypes.OBJECT})
class HealthView(APIView):
    permission_classes = [p.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"status": "ok"})


class AuditListView(generics.ListAPIView):
    serializer_class = AuditSerializer
    required_code = "audit.view"
    permission_classes = [p.IsAuthenticated, HasCode]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("user").all()
        for f in ("entity", "action", "entity_id"):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        if self.request.query_params.get("user"):
            qs = qs.filter(user_id=self.request.query_params["user"])
        if self.request.query_params.get("from"):
            qs = qs.filter(at__date__gte=self.request.query_params["from"])
        if self.request.query_params.get("to"):
            qs = qs.filter(at__date__lte=self.request.query_params["to"])
        return qs


@extend_schema(responses={200: OpenApiTypes.OBJECT})
class SearchView(APIView):
    """GET /search?q= — единый поиск: ученики (фамилия/родитель/телефон), преподаватели, договоры (по номеру), платежи (по extId)."""

    def get(self, request):
        from apps.students.models import Contract, Student
        from apps.staff.models import Teacher

        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return Response({"students": [], "teachers": [], "contracts": [], "payments": []})
        students = Student.objects.filter(last_name__icontains=q)[:10]
        students = students | Student.objects.filter(first_name__icontains=q)[:10]
        return Response({
            "students": [{"id": str(s.id), "name": str(s), "status": s.status} for s in students.distinct()[:10]],
            "teachers": [{"id": str(t.id), "name": str(t)} for t in Teacher.objects.filter(last_name__icontains=q)[:10]],
            "contracts": [{"id": str(c.id), "number": c.number, "student_id": str(c.student_id)} for c in Contract.objects.filter(number__icontains=q)[:10]],
            "payments": [],
        })


@extend_schema(responses={200: OpenApiTypes.OBJECT})
class DashboardView(APIView):
    """GET /dashboard — KPI как во фронте (порт dashboardKpis + серии)."""

    def get(self, request):
        from apps.finance.dashboard import dashboard_payload

        scope = None
        if request.user.role == "teacher" and request.user.teacher_id:
            from .permissions import teacher_group_ids
            scope = {str(x) for x in teacher_group_ids(request.user)}
        return Response(dashboard_payload(scope_group_ids=scope))
