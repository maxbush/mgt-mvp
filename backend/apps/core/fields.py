"""Шифрованные текстовые поля (Fernet) для чувствительных данных преподавателей."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _fernet() -> Fernet:
    key = getattr(settings, "FERNET_KEY", "") or ""
    if not key:
        # dev-fallback: стабильный ключ из SECRET_KEY (в prod обязателен env FERNET_KEY)
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key.encode() if isinstance(key, str) else key)


class EncryptedTextField(models.TextField):
    """TextField, хранящий значение в БД зашифрованным (Fernet)."""

    def get_prep_value(self, value):
        if value in (None, ""):
            return value
        if str(value).startswith("gAAAAA"):
            return value  # уже зашифровано
        return _fernet().encrypt(str(value).encode()).decode()

    def from_db_value(self, value, expression, connection):
        if not value or not str(value).startswith("gAAAAA"):
            return value
        try:
            return _fernet().decrypt(str(value).encode()).decode()
        except InvalidToken:
            return value
