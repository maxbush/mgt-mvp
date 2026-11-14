from rest_framework import serializers

from .models import Attendance, Lesson


class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = ["id", "lesson", "student", "status", "comment", "updated_at"]


class AttendanceWriteSerializer(serializers.Serializer):
    marks = serializers.DictField(child=serializers.ChoiceField(choices=[c[0] for c in Attendance.STATUS], allow_null=True))


class LessonSerializer(serializers.ModelSerializer):
    group_code = serializers.CharField(source="group.code", read_only=True)
    state = serializers.SerializerMethodField()
    effective_teacher = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = ["id", "group", "group_code", "date", "time", "topic", "substitute_teacher", "cancelled", "cancel_reason", "state", "effective_teacher"]

    def get_state(self, o):
        from .services import lesson_state

        return lesson_state(o)

    def get_effective_teacher(self, o):
        return str(o.effective_teacher_id) if o.effective_teacher_id else None


class LessonWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = ["id", "group", "date", "time", "topic", "substitute_teacher", "cancelled", "cancel_reason"]
