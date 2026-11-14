"""Синхронизация прав ролей после добавления finance.edit/acts.edit/acts.sign/audit.view.

Существующие БД хранят права в RolePermission — дефолты ROLE_DEFAULTS применяются
только при пустой таблице. Добавляем недостающие коды существующим группам.
"""
from django.db import migrations

ADD = {
    "accountant": ["finance.edit", "acts.edit", "audit.view"],
    "director": ["acts.sign"],
}


def forwards(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    RolePermission = apps.get_model("core", "RolePermission")
    for role, codes in ADD.items():
        try:
            g = Group.objects.get(name=role)
        except Group.DoesNotExist:
            continue
        for c in codes:
            RolePermission.objects.get_or_create(group=g, codename=c)


def backwards(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    RolePermission = apps.get_model("core", "RolePermission")
    for role, codes in ADD.items():
        try:
            g = Group.objects.get(name=role)
        except Group.DoesNotExist:
            continue
        RolePermission.objects.filter(group=g, codename__in=codes).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0002_initial"), ("auth", "0012_alter_user_first_name_max_length")]
    operations = [migrations.RunPython(forwards, backwards)]
