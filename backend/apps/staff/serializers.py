from rest_framework import serializers

from .models import Act, Teacher


class TeacherSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = [
            "id", "last_name", "first_name", "middle_name", "full_name", "phone", "email",
            "status", "passport_series", "passport_number", "passport_issued", "passport_date",
            "personal_number", "iban", "bank_name", "bank_bic", "address_reg",
            "contract_number", "contract_date", "subjects", "rate",
        ]

    def get_full_name(self, o):
        return f"{o.last_name} {o.first_name} {o.middle_name}".replace("  ", " ").strip()


class TeacherWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Teacher
        fields = [
            "id", "last_name", "first_name", "middle_name", "phone", "email", "status",
            "passport_series", "passport_number", "passport_issued", "passport_date",
            "personal_number", "iban", "bank_name", "bank_bic", "address_reg",
            "contract_number", "contract_date", "subjects", "rate",
        ]


class ActSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher", read_only=True)
    signer_name = serializers.CharField(source="signer", read_only=True)

    class Meta:
        model = Act
        fields = [
            "id", "number", "teacher", "teacher_name", "month", "lessons_count", "rate",
            "gross", "income_tax", "fszn", "net", "signer", "signer_name", "status",
            "source", "created_at",
        ]


class ActWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Act
        fields = [
            "id", "number", "teacher", "month", "lessons_count", "rate", "gross",
            "income_tax", "fszn", "net", "signer", "status", "source",
        ]
