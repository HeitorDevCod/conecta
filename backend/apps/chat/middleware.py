"""Autenticação JWT para conexões WebSocket.

O navegador não permite cabeçalhos customizados no handshake do WebSocket,
então o token de acesso é enviado como query string: ws://.../?token=<jwt>.
"""
from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def get_user_from_token(raw_token: str):
    try:
        token = AccessToken(raw_token)
    except TokenError:
        return AnonymousUser()
    User = get_user_model()
    try:
        return User.objects.get(pk=token["user_id"], is_active=True)
    except (User.DoesNotExist, KeyError, ValueError):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get("query_string", b"").decode())
        token = (query.get("token") or [""])[0]
        scope["user"] = await get_user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)
