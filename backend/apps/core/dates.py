"""«Сегодня» на сервере: в демо — зафиксировано (SystemSetting.demo_today),
в prod — реальная дата. Аналог settings.today фронта."""
from datetime import date as _date

from django.utils.timezone import localdate


def server_today() -> _date:
    from apps.dictionaries.models import SystemSetting

    v = SystemSetting.get("demo_today")
    if v:
        try:
            return _date.fromisoformat(str(v))
        except ValueError:
            pass
    return localdate()
