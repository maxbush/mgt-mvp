from rest_framework import serializers

from .models import Enrollment, Group, GroupPrice


class GroupPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupPrice
        fields = ["id", "date_from", "price"]


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student", read_only=True)
    group_code = serializers.CharField(source="group.code", read_only=True)

    class Meta:
        model = Enrollment
        fields = ["id", "student", "student_name", "group", "group_code", "date_from", "date_to"]


class GroupSerializer(serializers.ModelSerializer):
    prices = GroupPriceSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    direction_label = serializers.CharField(source="get_direction_display", read_only=True)
    current_price = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            "id", "code", "name", "direction", "direction_label", "branch", "branch_name",
            "teacher", "teacher_name", "room", "capacity", "schedule", "weekdays",
            "lesson_time", "status", "prices", "current_price", "student_count",
        ]

    def get_teacher_name(self, o):
        return str(o.teacher) if o.teacher_id else None

    def get_current_price(self, o):
        from django.utils.timezone import localdate

        return float(o.price_on(str(localdate())))

    def get_student_count(self, o):
        from .services import group_student_ids

        return len(group_student_ids(o.id))


class GroupWriteSerializer(serializers.ModelSerializer):
    prices = GroupPriceSerializer(many=True, required=False)

    class Meta:
        model = Group
        fields = [
            "id", "code", "name", "direction", "branch", "teacher", "room", "capacity",
            "schedule", "weekdays", "lesson_time", "status", "prices",
        ]

    def create(self, vd):
        prices = vd.pop("prices", [])
        g = Group.objects.create(**vd)
        for p in prices:
            GroupPrice.objects.create(group=g, **p)
        return g

    def update(self, inst, vd):
        prices = vd.pop("prices", None)
        for k, v in vd.items():
            setattr(inst, k, v)
        inst.save()
        if prices is not None:
            inst.prices.all().delete()
            for p in prices:
                GroupPrice.objects.create(group=inst, **p)
        return inst
