from django.conf import settings
from rest_framework.permissions import BasePermission


def has_verified_email(user) -> bool:
    return bool(user and user.is_authenticated and (user.email_verified or not settings.REQUIRE_EMAIL_VERIFICATION))


class IsEmailVerified(BasePermission):
    message = "Confirme seu e-mail para continuar. Enviamos um link para a sua caixa de entrada."

    def has_permission(self, request, view) -> bool:
        return has_verified_email(request.user)
