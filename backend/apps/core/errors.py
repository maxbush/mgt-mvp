"""Единый формат ошибок API (п. 7.4 ТЗ): {"error":{code,message,details}}."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler


def _payload(code, message, details=None):
    return {"error": {"code": code, "message": message, "details": details or {}}}


class ApiError(exceptions.APIException):
    code = "server_error"
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, message="", details=None):
        super().__init__(message or self.code)
        self.message = message or self.code
        self.details = details or {}


class ConflictError(ApiError):
    code = "conflict"
    status_code = status.HTTP_409_CONFLICT


class MonthClosedError(ApiError):
    code = "month_closed"
    status_code = 423


class RoleScopeError(ApiError):
    code = "forbidden"
    status_code = status.HTTP_403_FORBIDDEN


def exception_handler(exc, context):
    if isinstance(exc, ApiError):
        return Response(_payload(exc.code, exc.message, exc.details), status=exc.status_code)
    if isinstance(exc, Http404):
        return Response(_payload("not_found", "Объект не найден"), status=404)
    if isinstance(exc, DjangoValidationError):
        return Response(_payload("validation", "; ".join(exc.messages)), status=400)
    resp = drf_handler(exc, context)
    if resp is not None:
        code = getattr(exc, "default_code", "error")
        detail = resp.data
        if isinstance(detail, dict) and "detail" in detail:
            resp.data = _payload(code, str(detail["detail"]))
        elif isinstance(detail, dict):
            # Ошибки по полям: {"last_name": ["Обязательное поле."]} — сохраняем в details.
            resp.data = _payload(code, "Проверьте заполненные поля", details=detail)
        else:
            resp.data = _payload(code, str(detail) if detail else "Ошибка")
    return resp
