from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.core.audit import audit
from apps.core.errors import ApiError, ConflictError
from apps.core.permissions import HasCode, has_code, teacher_group_ids
from apps.students.models import Student

from .models import Enrollment, Group, MembershipChange
from .serializers import EnrollmentSerializer, GroupSerializer, GroupWriteSerializer
from .services import enroll, group_student_ids, transfer, unenroll


class GroupViewSet(viewsets.ModelViewSet):
    required_code = "groups.edit"
    view_code = "groups.view"
    permission_classes = [HasCode]

    def get_serializer_class(self):
        return GroupSerializer if self.request.method in ("GET", "HEAD") else GroupWriteSerializer

    def get_queryset(self):
        qs = Group.objects.select_related("branch", "teacher").prefetch_related("prices")
        # scope преподавателя: свои группы + группы с его заменами
        if not getattr(self, "swagger_fake_view", False) and self.request.user.role == "teacher" and self.request.user.teacher_id and not has_code(self.request.user, "groups.edit"):
            qs = qs.filter(id__in=teacher_group_ids(self.request.user))
        for f in ("branch", "direction", "status", "teacher"):
            v = self.request.query_params.get(f)
            if v:
                qs = qs.filter(**{f: v})
        return qs

    def perform_create(self, s):
        with transaction.atomic():
            obj = s.save()
            audit(self.request.user, "create", "groups.group", obj.pk, after=GroupSerializer(obj).data)

    def perform_update(self, s):
        with transaction.atomic():
            obj = s.save()
            audit(self.request.user, "update", "groups.group", obj.pk, after=GroupSerializer(obj).data)

    @action(detail=True, methods=["post"])
    def enroll(self, request, pk=None):
        """POST /groups/{id}/enroll {student_id, date}"""
        g = self.get_object()
        st = get_object_or_404(Student, pk=request.data.get("student_id"))
        try:
            en = enroll(st, g, request.data.get("date"), user=request.user)
        except ValueError as e:
            raise ConflictError(str(e))
        audit(request.user, "membership", "groups.enrollment", en.pk, after={"kind": "enroll", "student": str(st.id), "group": g.code})
        return Response(EnrollmentSerializer(en).data, status=201)

    @action(detail=True, methods=["post"])
    def unenroll(self, request, pk=None):
        """POST /groups/{id}/unenroll {student_id, date}"""
        g = self.get_object()
        st = get_object_or_404(Student, pk=request.data.get("student_id"))
        try:
            en = unenroll(st, g, request.data.get("date"), user=request.user)
        except ValueError as e:
            raise ConflictError(str(e))
        audit(request.user, "membership", "groups.enrollment", en.pk, after={"kind": "unenroll", "student": str(st.id), "group": g.code})
        return Response(EnrollmentSerializer(en).data)

    @action(detail=True, methods=["get"], url_path="membership-history")
    def membership_history(self, request, pk=None):
        qs = MembershipChange.objects.filter(from_group_id=pk).select_related("student", "from_group", "to_group")
        qs = qs | MembershipChange.objects.filter(to_group_id=pk).select_related("student", "from_group", "to_group")
        return Response([{
            "id": m.id, "student": str(m.student), "kind": m.kind, "date": m.date,
            "from_group": m.from_group.code if m.from_group_id else None,
            "to_group": m.to_group.code if m.to_group_id else None,
        } for m in qs.distinct()[:200]])


@extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
@api_view(["POST"])
def transfer_enrollment(request):
    """POST /enrollments/transfer {student_id, from_group_id, to_group_id, date}"""
    st = get_object_or_404(Student, pk=request.data.get("student_id"))
    g_from = get_object_or_404(Group, pk=request.data.get("from_group_id"))
    g_to = get_object_or_404(Group, pk=request.data.get("to_group_id"))
    if not has_code(request.user, "groups.edit"):
        from apps.core.errors import RoleScopeError
        raise RoleScopeError("Недостаточно прав")
    try:
        en = transfer(st, g_from, g_to, request.data.get("date"), user=request.user)
    except ValueError as e:
        raise ConflictError(str(e))
    audit(request.user, "membership", "groups.enrollment", en.pk, after={
        "kind": "transfer", "student": str(st.id), "from": g_from.code, "to": g_to.code,
    })
    return Response(EnrollmentSerializer(en).data, status=201)
