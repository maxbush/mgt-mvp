from rest_framework import serializers

from .models import (
    AcademicYear, ActRate, AddendumTemplate, Branch, ChargePolicy, Direction, Signer, StatementSheet, TaxRate,
)


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = "__all__"


class DirectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Direction
        fields = "__all__"


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "name", "start_date", "end_date", "is_current"]


class SignerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Signer
        fields = "__all__"


class StatementSheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = StatementSheet
        fields = "__all__"


class ActRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActRate
        fields = "__all__"


class ChargePolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = ChargePolicy
        fields = "__all__"


class TaxRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRate
        fields = "__all__"


class AddendumTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AddendumTemplate
        fields = "__all__"
