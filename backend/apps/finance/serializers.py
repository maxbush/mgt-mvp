from rest_framework import serializers

from .models import Adjustment, MonthClose, Payment, PaymentSplit


class PaymentSplitSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student", read_only=True)

    class Meta:
        model = PaymentSplit
        fields = ["id", "student", "student_name", "amount"]


class PaymentSerializer(serializers.ModelSerializer):
    splits = PaymentSplitSerializer(many=True, read_only=True)
    student_name = serializers.CharField(source="student", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "student", "student_name", "date", "amount", "method", "method_label",
            "status", "payer", "ext_id", "note", "comment", "reject_reason",
            "import_batch", "splits", "created_at",
        ]


class PaymentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "student", "date", "amount", "method", "status", "payer", "ext_id", "note", "comment"]

    def validate_amount(self, v):
        if v <= 0:
            raise serializers.ValidationError("Сумма платежа должна быть положительной")
        return v


class AdjustmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student", read_only=True)

    class Meta:
        model = Adjustment
        fields = ["id", "student", "student_name", "date", "amount", "comment", "created_at"]
        read_only_fields = ["created_at"]


class MonthCloseSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonthClose
        fields = ["id", "month", "closed_at", "reopened_at", "reopen_reason"]
