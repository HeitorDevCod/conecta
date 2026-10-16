"""Envio dos e-mails de conta (texto puro + HTML)."""
from __future__ import annotations

import logging
from urllib.parse import urlencode

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from .tokens import make_email_token, make_reset_params

logger = logging.getLogger(__name__)


def _send(user, subject: str, template: str, context: dict) -> None:
    context = {"user": user, **context}
    text = render_to_string(f"accounts/email/{template}.txt", context)
    html = render_to_string(f"accounts/email/{template}.html", context)
    message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [user.email])
    message.attach_alternative(html, "text/html")
    try:
        message.send()
    except Exception:  # um SMTP fora do ar não deve derrubar o cadastro
        logger.exception("Falha ao enviar e-mail '%s' para o usuário %s", template, user.pk)


def send_verification_email(user) -> None:
    link = f"{settings.FRONTEND_URL}/confirmar-email?{urlencode({'token': make_email_token(user)})}"
    _send(
        user,
        "Confirme seu e-mail no Conecta",
        "verify_email",
        {"link": link, "hours": settings.EMAIL_VERIFICATION_MAX_AGE // 3600},
    )


def send_password_reset_email(user) -> None:
    uid, token = make_reset_params(user)
    link = f"{settings.FRONTEND_URL}/redefinir-senha?{urlencode({'uid': uid, 'token': token})}"
    _send(
        user,
        "Redefina sua senha do Conecta",
        "password_reset",
        {"link": link, "hours": settings.PASSWORD_RESET_TIMEOUT // 3600},
    )
