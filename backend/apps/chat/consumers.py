"""WebSocket da sala: mensagens de texto, presença e sinalização WebRTC.

Protocolo (JSON, campo ``type`` discrimina o evento):

Cliente → servidor
    chat.message   {content}
    chat.typing    {isTyping}
    call.join      {media: {audio, video}}
    call.leave     {}
    call.media     {media: {audio, video}}
    call.reaction  {emoji}
    call.caption   {text, final}
    rtc.offer      {to, sdp}
    rtc.answer     {to, sdp}
    rtc.ice        {to, candidate}

Servidor → cliente
    session.ready  {peerId, peers}
    presence.joined / presence.left
    chat.message   {message}
    chat.typing    {peerId, displayName, isTyping}
    call.accepted  {participants}
    call.joined / call.left / call.media / call.reaction / call.caption
    rtc.offer / rtc.answer / rtc.ice   {from, ...}
    error          {code, detail}

A chamada usa topologia *mesh*: quem entra cria uma oferta para cada
participante já presente. O servidor apenas encaminha a sinalização; áudio e
vídeo trafegam diretamente entre os navegadores (ou via TURN).
"""
from __future__ import annotations

import time
import uuid
from collections import deque
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings

from apps.accounts.permissions import has_verified_email

from .models import Message, Room
from .presence import MediaState, Peer, get_presence_store
from .serializers import MessageSerializer, clean_message_content

CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404
CLOSE_EMAIL_NOT_VERIFIED = 4412

MAX_SIGNAL_BYTES = 64_000
RATE_LIMIT_MESSAGES = 10
RATE_LIMIT_WINDOW_SECONDS = 5.0
MAX_CAPTION_LENGTH = 300
ALLOWED_REACTIONS = frozenset({"🔥", "👏", "😂", "❤️", "🚀", "🎉", "👍", "🤯"})


class RoomConsumer(AsyncJsonWebsocketConsumer):
    room: Room
    group_name: str
    peer_id: str

    # ------------------------------------------------------------ ciclo de vida
    async def connect(self) -> None:
        self.peer_id = ""
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        if not has_verified_email(user):
            await self.close(code=CLOSE_EMAIL_NOT_VERIFIED)
            return

        slug: str = self.scope["url_route"]["kwargs"]["slug"]
        room = await self._get_room(slug)
        if room is None:
            await self.close(code=CLOSE_NOT_FOUND)
            return
        if not await self._is_member(room, user.pk):
            await self.close(code=CLOSE_FORBIDDEN)
            return

        self.room = room
        self.group_name = f"room_{room.pk.hex}"
        self.peer_id = uuid.uuid4().hex
        self._sent_at: deque[float] = deque(maxlen=RATE_LIMIT_MESSAGES)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        peer = Peer(
            peerId=self.peer_id,
            channelName=self.channel_name,
            userId=user.pk,
            displayName=user.display_name,
            avatarColor=user.avatar_color,
        )
        store = get_presence_store()
        await store.add(self.room.slug, peer)
        peers = await store.members(self.room.slug)

        await self.send_json({"type": "session.ready", "peerId": self.peer_id, "peers": [p.public() for p in peers]})
        await self._broadcast({"type": "presence.joined", "peer": peer.public()})

    async def disconnect(self, code: int) -> None:
        if not self.peer_id:
            return
        store = get_presence_store()
        peer = await store.remove(self.room.slug, self.peer_id)
        if peer and peer.inCall:
            await self._broadcast({"type": "call.left", "peerId": self.peer_id})
        await self._broadcast({"type": "presence.left", "peerId": self.peer_id})
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # ------------------------------------------------------------ roteamento
    async def receive_json(self, content: Any, **kwargs) -> None:
        if not isinstance(content, dict) or not isinstance(content.get("type"), str):
            await self._error("bad_request", "Evento inválido.")
            return

        handlers = {
            "chat.message": self._on_chat_message,
            "chat.typing": self._on_chat_typing,
            "call.join": self._on_call_join,
            "call.leave": self._on_call_leave,
            "call.media": self._on_call_media,
            "call.reaction": self._on_call_reaction,
            "call.caption": self._on_call_caption,
            "rtc.offer": self._on_rtc_signal,
            "rtc.answer": self._on_rtc_signal,
            "rtc.ice": self._on_rtc_signal,
        }
        handler = handlers.get(content["type"])
        if handler is None:
            await self._error("unknown_event", f"Evento desconhecido: {content['type']}")
            return
        await handler(content)

    # ------------------------------------------------------------ chat de texto
    async def _on_chat_message(self, event: dict) -> None:
        if self._rate_limited():
            await self._error("rate_limited", "Você está enviando mensagens rápido demais.")
            return
        try:
            text = clean_message_content(event.get("content"))
        except ValueError as exc:
            await self._error("invalid_message", str(exc))
            return
        payload = await self._save_message(text)
        await self._broadcast({"type": "chat.message", "message": payload, "clientId": event.get("clientId")})

    async def _on_chat_typing(self, event: dict) -> None:
        user = self.scope["user"]
        await self._broadcast(
            {
                "type": "chat.typing",
                "peerId": self.peer_id,
                "displayName": user.display_name,
                "isTyping": bool(event.get("isTyping")),
            }
        )

    # ------------------------------------------------------------ chamada
    async def _on_call_join(self, event: dict) -> None:
        store = get_presence_store()
        peers = await store.members(self.room.slug)
        me = next((p for p in peers if p.peerId == self.peer_id), None)
        if me is None:
            return
        in_call = [p for p in peers if p.inCall and p.peerId != self.peer_id]
        if not me.inCall and len(in_call) >= settings.CALL_MAX_PARTICIPANTS:
            await self._error("call_full", "A chamada atingiu o limite de participantes.")
            return

        me.inCall = True
        me.media = _parse_media(event.get("media"))
        await store.save(self.room.slug, me)

        await self.send_json({"type": "call.accepted", "participants": [p.public() for p in in_call]})
        await self._broadcast({"type": "call.joined", "peer": me.public()})

    async def _on_call_leave(self, _event: dict) -> None:
        store = get_presence_store()
        me = await store.get(self.room.slug, self.peer_id)
        if me is None or not me.inCall:
            return
        me.inCall = False
        await store.save(self.room.slug, me)
        await self._broadcast({"type": "call.left", "peerId": self.peer_id})

    async def _on_call_media(self, event: dict) -> None:
        store = get_presence_store()
        me = await store.get(self.room.slug, self.peer_id)
        if me is None or not me.inCall:
            return
        me.media = _parse_media(event.get("media"))
        await store.save(self.room.slug, me)
        await self._broadcast({"type": "call.media", "peerId": self.peer_id, "media": me.public()["media"]})

    async def _on_call_reaction(self, event: dict) -> None:
        emoji = event.get("emoji")
        if emoji not in ALLOWED_REACTIONS:
            await self._error("bad_reaction", "Reação não suportada.")
            return
        if self._rate_limited():
            return
        await self._broadcast({"type": "call.reaction", "peerId": self.peer_id, "emoji": emoji})

    async def _on_call_caption(self, event: dict) -> None:
        """Legendas ao vivo: o navegador transcreve a fala localmente e envia o texto."""
        text = event.get("text")
        if not isinstance(text, str) or not text.strip():
            return
        await self._broadcast(
            {
                "type": "call.caption",
                "peerId": self.peer_id,
                "displayName": self.scope["user"].display_name,
                "text": text.strip()[:MAX_CAPTION_LENGTH],
                "final": bool(event.get("final")),
            }
        )

    async def _on_rtc_signal(self, event: dict) -> None:
        target_id = event.get("to")
        if not isinstance(target_id, str) or target_id == self.peer_id:
            await self._error("bad_signal", "Destino inválido.")
            return

        kind: str = event["type"]
        if kind in ("rtc.offer", "rtc.answer"):
            sdp = event.get("sdp")
            if not _valid_sdp(sdp, "offer" if kind == "rtc.offer" else "answer"):
                await self._error("bad_signal", "SDP inválido.")
                return
            relay = {"type": kind, "from": self.peer_id, "sdp": sdp}
        else:
            candidate = event.get("candidate")
            if not isinstance(candidate, dict) or len(str(candidate)) > MAX_SIGNAL_BYTES:
                await self._error("bad_signal", "Candidato ICE inválido.")
                return
            relay = {"type": kind, "from": self.peer_id, "candidate": candidate}

        store = get_presence_store()
        target = await store.get(self.room.slug, target_id)
        if target is None:
            await self._error("peer_gone", "O participante saiu da sala.")
            return
        await self.channel_layer.send(target.channelName, {"type": "peer.direct", "event": relay})

    # ------------------------------------------------------------ handlers do channel layer
    async def room_broadcast(self, message: dict) -> None:
        await self.send_json(message["event"])

    async def peer_direct(self, message: dict) -> None:
        await self.send_json(message["event"])

    # ------------------------------------------------------------ utilitários
    async def _broadcast(self, event: dict) -> None:
        await self.channel_layer.group_send(self.group_name, {"type": "room.broadcast", "event": event})

    async def _error(self, code: str, detail: str) -> None:
        await self.send_json({"type": "error", "code": code, "detail": detail})

    def _rate_limited(self) -> bool:
        now = time.monotonic()
        if len(self._sent_at) == RATE_LIMIT_MESSAGES and now - self._sent_at[0] < RATE_LIMIT_WINDOW_SECONDS:
            return True
        self._sent_at.append(now)
        return False

    @database_sync_to_async
    def _get_room(self, slug: str) -> Room | None:
        return Room.objects.filter(slug=slug).first()

    @database_sync_to_async
    def _is_member(self, room: Room, user_id: int) -> bool:
        return room.members.filter(pk=user_id).exists()

    @database_sync_to_async
    def _save_message(self, text: str) -> dict:
        message = Message.objects.create(room=self.room, author=self.scope["user"], content=text)
        message.room = self.room
        return MessageSerializer(message).data


def _parse_media(raw: Any) -> MediaState:
    if not isinstance(raw, dict):
        return MediaState()
    return MediaState(audio=bool(raw.get("audio", True)), video=bool(raw.get("video", True)))


def _valid_sdp(raw: Any, expected_type: str) -> bool:
    return (
        isinstance(raw, dict)
        and raw.get("type") == expected_type
        and isinstance(raw.get("sdp"), str)
        and 0 < len(raw["sdp"]) <= MAX_SIGNAL_BYTES
    )
