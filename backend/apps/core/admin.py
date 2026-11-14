from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import AuditLog, ImportBatch, IntegrationEvent, RolePermission, User


@admin.register(User)
class CrmUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("CRM", {"fields": ("role", "teacher")}),)
    list_display = ("username", "get_full_name", "role", "is_active")


for m in (RolePermission, AuditLog, ImportBatch, IntegrationEvent):
    admin.site.register(m)
