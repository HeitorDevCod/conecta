"""Tokens dos links enviados por e-mail.

- Confirmação de e-mail: valor assinado com o id e o e-mail atual do usuário.
  Trocar o e-mail invalida o link antigo; confirmar duas vezes é inofensivo.
- Redefinição de senha: gerador nativo do Django. O token depende do hash da
  senha e do último login, então deixa de valer assim que é usado.
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

EMAIL_SALT = "conecta.accounts.verify-email"


def make_email_token(user) -> str:
    return signing.dumps({"uid": user.pk, "email": user.email}, salt=EMAIL_SALT, compress=True)


def read_email_token(token: str):
    """Devolve o usuário do token, ou None se for inválido, expirado ou de um e-mail antigo."""
    try:
        data = signing.loads(token, salt=EMAIL_SALT, max_age=settings.EMAIL_VERIFICATION_MAX_AGE)
    except signing.BadSignature:  # inclui SignatureExpired
        return None
    User = get_user_model()
    user = User.objects.filter(pk=data.get("uid"), is_active=True).first()
    if user is None or user.email != data.get("email"):
        return None
    return user


def make_reset_params(user) -> tuple[str, str]:
    return urlsafe_base64_encode(force_bytes(user.pk)), default_token_generator.make_token(user)


def read_reset_params(uid: str, token: str):
    User = get_user_model()
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=pk, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None
    return user if default_token_generator.check_token(user, token) else None
