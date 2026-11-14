from rest_framework import serializers

from .models import Addendum


class AddendumSerializer(serializers.ModelSerializer):
    contract_number = serializers.CharField(source="contract.number", read_only=True)
    student_name = serializers.CharField(source="contract.student", read_only=True)

    class Meta:
        model = Addendum
        fields = ["id", "contract", "contract_number", "student_name", "number", "date", "template", "body", "created_at"]
        read_only_fields = ["created_at"]
