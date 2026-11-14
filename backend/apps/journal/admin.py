from django.contrib import admin

from .models import Attendance, Lesson

admin.site.register(Lesson)
admin.site.register(Attendance)
