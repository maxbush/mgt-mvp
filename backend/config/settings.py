"""Настройки backend'а CRM «Инженерная школа».

Вся конфигурация — через переменные окружения (см. .env.example).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-change-me")
DEBUG = os.environ.get("DEBUG", "1") == "1"
ALLOWED_HOSTS = [h for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "corsheaders",
    "axes",
    "apps.core",
    "apps.dictionaries",
    "apps.students",
    "apps.groups",
    "apps.journal",
    "apps.finance",
    "apps.staff",
    "apps.documents",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
WSGI_APPLICATION = "config.wsgi.application"

# --- БД: PostgreSQL через env, по умолчанию SQLite для dev ---
if os.environ.get("DB_NAME"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["DB_NAME"],
            "USER": os.environ.get("DB_USER", "crm"),
            "PASSWORD": os.environ.get("DB_PASSWORD", ""),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}

AUTH_USER_MODEL = "core.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]

# Блокировка подбора пароля: 5 попыток → 15 минут
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = 0.25  # часа
# Вложенный список = AND (username+ip вместе); плоский список в axes — OR и лочил бы весь IP.
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]

LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "Europe/Minsk"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- DRF ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.DefaultPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "EXCEPTION_HANDLER": "apps.core.errors.exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}
SPECTACULAR_SETTINGS = {"TITLE": "CRM «Инженерная школа» API", "VERSION": "1.0", "SERVE_INCLUDE_SCHEMA": False}

# --- Сессия / CSRF ---
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 12 * 3600  # таймаут бездействия 12 ч
CSRF_COOKIE_SAMESITE = "Lax"
CORS_ALLOWED_ORIGINS = [o for o in os.environ.get("CORS_ORIGINS", "http://localhost:5199,http://localhost:5173").split(",") if o]
CORS_ALLOW_CREDENTIALS = True

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"

# --- Прикладные ключи ---
# Ключ Fernet для шифрования чувствительных полей (паспорт/банк преподавателей).
# В prod задаётся через env FERNET_KEY; для dev генерируем стабильный из SECRET_KEY.
FERNET_KEY = os.environ.get("FERNET_KEY", "")

# bePaid (пусто = адаптер выключен)
BEPAID_SHOP_ID = os.environ.get("BEPAID_SHOP_ID", "")
BEPAID_SECRET_KEY = os.environ.get("BEPAID_SECRET_KEY", "")
BEPAID_WEBHOOK_IPS = [x for x in os.environ.get("BEPAID_WEBHOOK_IPS", "").split(",") if x]
BEPAID_SERVICE_NUMBER = os.environ.get("BEPAID_SERVICE_NUMBER", "")

# Загрузки
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # CSV/XLSX ≤ 10 МБ

# Fail-closed для прода: без явных секретов приложение не должно стартовать.
if not DEBUG:
    from django.core.exceptions import ImproperlyConfigured

    if SECRET_KEY == "dev-insecure-change-me" or len(SECRET_KEY) < 32:
        raise ImproperlyConfigured("SECRET_KEY не задан или оставлен дефолтным при DEBUG=0")
    if not FERNET_KEY:
        raise ImproperlyConfigured("FERNET_KEY обязателен при DEBUG=0: иначе ПД шифруются ключом из SECRET_KEY")
