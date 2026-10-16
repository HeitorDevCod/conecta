"""Registro de presença por sala.

Cada conexão WebSocket é um *peer* (um usuário pode ter várias abas abertas).
Guardamos, por sala, quem está online e quem está na chamada de voz/vídeo.
Em produção usamos Redis para que vários processos ASGI compartilhem o estado;
sem Redis (desenvolvimento/testes) caímos para um armazenamento em memória.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass, field
from typing import Protocol

from django.conf import settings


@dataclass(slots=True)
class MediaState:
    audio: bool = True
    video: bool = True


@dataclass(slots=True)
class Peer:
    peerId: str  # noqa: N815 - nome espelha o contrato JSON do frontend
    channelName: str  # noqa: N815
    userId: int  # noqa: N815
    displayName: str  # noqa: N815
    avatarColor: str  # noqa: N815
    inCall: bool = False  # noqa: N815
    media: MediaState = field(default_factory=MediaState)

    def public(self) -> dict:
        data = asdict(self)
        data.pop("channelName")
        return data

    @classmethod
    def from_json(cls, raw: str) -> Peer:
        data = json.loads(raw)
        data["media"] = MediaState(**data.get("media", {}))
        return cls(**data)


class PresenceStore(Protocol):
    async def add(self, room: str, peer: Peer) -> None: ...
    async def remove(self, room: str, peer_id: str) -> Peer | None: ...
    async def get(self, room: str, peer_id: str) -> Peer | None: ...
    async def save(self, room: str, peer: Peer) -> None: ...
    async def members(self, room: str) -> list[Peer]: ...


class MemoryPresenceStore:
    def __init__(self) -> None:
        self._rooms: dict[str, dict[str, Peer]] = {}
        self._lock = asyncio.Lock()

    async def add(self, room: str, peer: Peer) -> None:
        async with self._lock:
            self._rooms.setdefault(room, {})[peer.peerId] = peer

    async def remove(self, room: str, peer_id: str) -> Peer | None:
        async with self._lock:
            peers = self._rooms.get(room, {})
            peer = peers.pop(peer_id, None)
            if not peers:
                self._rooms.pop(room, None)
            return peer

    async def get(self, room: str, peer_id: str) -> Peer | None:
        return self._rooms.get(room, {}).get(peer_id)

    async def save(self, room: str, peer: Peer) -> None:
        await self.add(room, peer)

    async def members(self, room: str) -> list[Peer]:
        return list(self._rooms.get(room, {}).values())


class RedisPresenceStore:
    KEY_TTL_SECONDS = 60 * 60 * 6  # limpa salas esquecidas após quedas abruptas

    def __init__(self, url: str) -> None:
        from redis.asyncio import Redis

        self._redis = Redis.from_url(url, decode_responses=True)

    @staticmethod
    def _key(room: str) -> str:
        return f"conecta:presence:{room}"

    async def add(self, room: str, peer: Peer) -> None:
        key = self._key(room)
        await self._redis.hset(key, peer.peerId, json.dumps(asdict(peer)))
        await self._redis.expire(key, self.KEY_TTL_SECONDS)

    async def remove(self, room: str, peer_id: str) -> Peer | None:
        key = self._key(room)
        raw = await self._redis.hget(key, peer_id)
        await self._redis.hdel(key, peer_id)
        return Peer.from_json(raw) if raw else None

    async def get(self, room: str, peer_id: str) -> Peer | None:
        raw = await self._redis.hget(self._key(room), peer_id)
        return Peer.from_json(raw) if raw else None

    async def save(self, room: str, peer: Peer) -> None:
        await self.add(room, peer)

    async def members(self, room: str) -> list[Peer]:
        values = await self._redis.hvals(self._key(room))
        return [Peer.from_json(raw) for raw in values]


_store: PresenceStore | None = None


def get_presence_store() -> PresenceStore:
    global _store
    if _store is None:
        _store = RedisPresenceStore(settings.REDIS_URL) if settings.REDIS_URL else MemoryPresenceStore()
    return _store


def reset_presence_store() -> None:
    """Usado nos testes para isolar o estado entre casos."""
    global _store
    _store = None
