from django.contrib import admin

from .models import Adjustment, MonthBalance, MonthClose, Payment, PaymentSplit

for m in (Payment, PaymentSplit, Adjustment, MonthClose, MonthBalance):
    admin.site.register(m)
