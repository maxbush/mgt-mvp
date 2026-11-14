from django.contrib import admin

from .models import Enrollment, Group, GroupPrice, MembershipChange

for m in (Group, GroupPrice, Enrollment, MembershipChange):
    admin.site.register(m)
