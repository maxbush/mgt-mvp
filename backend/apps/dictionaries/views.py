from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import audit, audit_delete, audit_save
from apps.core.permissions import HasCode

from .models import (
    AcademicYear, ActRate, AddendumTemplate, Branch, ChargePolicy, Direction, Signer, StatementSheet, SystemSetting, TaxRate,
)
from .serializers import (
    AcademicYearSerializer, ActRateSerializer, AddendumTemplateSerializer, BranchSerializer, ChargePolicySerializer,
    DirectionSerializer, SignerSerializer, StatementSheetSerializer, TaxRateSerializer,
)


class BaseDictViewSet(viewsets.ModelViewSet):
    required_code = "settings.edit"
    view_code = "settings.edit"
    permission_classes = [HasCode]

    def perform_create(self, s):
        audit_save(self.request, s, "create", after=lambda obj: s.data)

    def perform_update(self, s):
        audit_save(self.request, s, "update", after=lambda obj: s.data)

    def perform_destroy(self, obj):
        audit_delete(self.request, obj)


class BranchViewSet(BaseDictViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer


class DirectionViewSet(BaseDictViewSet):
    queryset = Direction.objects.all()
    serializer_class = DirectionSerializer


class AcademicYearViewSet(BaseDictViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    http_method_names = ["get", "post", "head", "options"]

    @action(detail=True, methods=["post"], url_path="set-current")
    def set_current(self, request, pk=None):
        with transaction.atomic():
            AcademicYear.objects.update(is_current=False)
            y = self.get_object()
      


class SignerViewSet(BaseDictViewSet):
    queryset = Signer.objects.all()
    serializer_class = SignerSerializer


class StatementSheetViewSet(BaseDictViewSet):
    queryset = StatementSheet.objects.select_related("branch", "direction")
    serializer_class = StatementSheetSerializer


class AddendumTemplateViewSet(BaseDictViewSet):
    queryset = AddendumTemplate.objects.all()
    serializer_class = AddendumTemplateSerializer


class ActRateViewSet(BaseDictViewSet):
    queryset = ActRate.objects.all()
    serializer_class = ActRateSerializer


class ChargePolicyViewSet(BaseDictViewSet):
    queryset = ChargePolicy.objects.all()
    serializer_class = ChargePolicySerializer


class TaxRateViewSet(BaseDictViewSet):
    queryset = TaxRate.objects.all()
    serializer_class = TaxRateSerializer


from rest_framework import viewsets as _vs


class SettingsView(_vs.ViewSet):
    """GET/PATCH /settings/ — оперативные настройки (SystemSetting). GET — всем, PATCH — settings.edit."""

    permission_classes = []

    def list(self, request):
        return Response({s.key: s.value for s in SystemSetting.objects.all()})

    @transaction.atomic
    def partial_update(self, request, pk=None):
        from apps.core.permissions import has_code
        if not has_code(request.user, "settings.edit"):
            from apps.core.errors import RoleScopeError
            raise RoleScopeError("Нет права settings.edit")
        for k, v in request.data.items():
            SystemSetting.set(k, v)
        audit(request.user, "settings", "system_setting", after=request.data)
        return self.list(request)
