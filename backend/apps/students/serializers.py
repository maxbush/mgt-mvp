from rest_framework import serializers

from .models import Contract, Student


class ContractSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)

    class Meta:
        model = Contract
        fields = ["id", "student", "academic_year", "academic_year_name", "number", "date", "status", "closed_at", "comment"]


class StudentSerializer(serializers.ModelSerializer):
    contracts = ContractSerializer(many=True, read_only=True)
    full_name = serializers.SerializerMethodField()
    groups = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            "id", "last_name", "first_name", "middle_name", "full_name", "birth_date", "birth_year", "grade",
            "school", "parent_name", "parent_phone", "parent_phone2", "parent_email", "comment", "status",
            "opening_balance", "branch", "created_at", "contracts", "groups", "balance",
        ]

    def get_full_name(self, o):
        return f"{o.last_name} {o.first_name} {o.middle_name}".replace("  ", " ").strip()

    def get_groups(self, o):
        from apps.groups.services import student_current_groups

        return [{"id": str(g.id), "code": g.code, "name": g.name} for g in student_current_groups(o)]

    def get_balance(self, o):
        from apps.finance.services import current_balance

        return float(current_balance(o.id))


class StudentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = [
            "id", "last_name", "first_name", "middle_name", "birth_date", "birth_year", "grade", "school",
            "parent_name", "parent_phone", "parent_phone2", "parent_email", "comment", "status", "opening_balance",
        ]
