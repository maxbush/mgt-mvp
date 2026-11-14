from django.contrib import admin

from .models import (
    AcademicYear, ActRate, AddendumTemplate, Branch, ChargePolicy, Direction, Signer, StatementSheet, SystemSetting, TaxRate,
)

for m in (Branch, Direction, AcademicYear, Signer, StatementSheet, ActRate, ChargePolicy, TaxRate, SystemSetting, AddendumTemplate):
    admin.site.register(m)
