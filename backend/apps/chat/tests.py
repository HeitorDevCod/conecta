import pytest
from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.chat.middleware import JWTAuthMiddleware
from apps.chat.models import Message, Room
from apps.chat.presence import reset_presence_store
from apps.chat.routing import websocket_urlpatterns

User = get_user_model()
application = JWTAuthMiddleware(URLRouter(websocket_urlpatterns))


def make_user(name: str):
    return User.objects.create_user(
        username=name, email=f"{name}@example.com", display_name=name.title(), password="senha-forte-123"
    )


@pytest.fixture(autouse=True)
def _fresh_presence():
    reset_presence_store()
    yield
    reset_presence_store()


# ------------------------------------------------------------------ REST


@pytest.mark.django_db
def test_create_room_generates_unique_slug_and_adds_creator() -> None:
    user = make_user("ana")
    client = APIClient()
    client.force_authenticate(user)

    first = client.post("/api/rooms/", {"name": "Time de Produto"}, format="json")
    second = client.post("/api/rooms/", {"name": "Time de Produto"}, format="json")

    assert first.status_code == 201
    assert first.json()["slug"] == "time-de-produto"
    assert second.json()["slug"] == "time-de-produto-2"
    assert first.json()["isMember"] is True
    assert first.json()["memberCount"] == 1


@pytest.mark.django_db
def test_messages_require_membership() -> None:
    owner, outsider = make_user("ana"), make_user("caio")
    room = Room.objects.create(name="Geral", slug="geral", created_by=owner)
    room.members.add(owner)
    client = APIClient()
    client.force_authenticate(outsider)

    assert client.get("/api/rooms/geral/messages/").status_code == 403
    assert client.post("/api/rooms/geral/join/").status_code == 200
    assert client.get("/api/rooms/geral/messages/").status_code == 200


@pytest.mark.django_db
def test_rtc_config_lists_ice_servers() -> None:
    client = APIClient()
    client.force_authenticate(make_user("ana"))
    body = client.get("/api/rtc/config/").json()
    assert body["iceServers"]
    assert body["maxParticipants"] >= 2


# ------------------------------------------------------------------ WebSocket


@database_sync_to_async
def setup_room():
    ana, bia = make_user("ana"), make_user("bia")
    room = Room.objects.create(name="Geral", slug="geral", created_by=ana)
    room.members.add(ana, bia)
    return str(AccessToken.for_user(ana)), str(AccessToken.for_user(bia))


async def connect(token: str) -> WebsocketCommunicator:
    communicator = WebsocketCommunicator(application, f"/ws/rooms/geral/?token={token}")
    connected, _ = await communicator.connect()
    assert connected
    return communicator


async def receive_until(communicator: WebsocketCommunicator, event_type: str) -> dict:
    for _ in range(20):
        event = await communicator.receive_json_from()
        if event["type"] == event_type:
            return event
    raise AssertionError(f"evento {event_type} não recebido")


@pytest.mark.django_db(transaction=True)
async def test_websocket_rejects_anonymous() -> None:
    await setup_room()
    communicator = WebsocketCommunicator(application, "/ws/rooms/geral/")
    connected, code = await communicator.connect()
    assert not connected
    assert code == 4401


@pytest.mark.django_db(transaction=True)
async def test_chat_message_is_persisted_and_broadcast() -> None:
    ana_token, bia_token = await setup_room()
    ana = await connect(ana_token)
    ready = await ana.receive_json_from()
    assert ready["type"] == "session.ready"
    await ana.receive_json_from()  # presence.joined (ela mesma)

    bia = await connect(bia_token)
    await bia.receive_json_from()  # session.ready
    await bia.receive_json_from()  # presence.joined
    assert (await ana.receive_json_from())["type"] == "presence.joined"

    await ana.send_json_to({"type": "chat.message", "content": "  Olá, Bia!  "})
    received = await bia.receive_json_from()
    assert received["type"] == "chat.message"
    assert received["message"]["content"] == "Olá, Bia!"
    assert await database_sync_to_async(Message.objects.count)() == 1

    await ana.disconnect()
    await bia.disconnect()


@pytest.mark.django_db(transaction=True)
async def test_rtc_signaling_is_routed_to_target_peer() -> None:
    ana_token, bia_token = await setup_room()
    ana = await connect(ana_token)
    ana_peer = (await ana.receive_json_from())["peerId"]
    await ana.receive_json_from()

    bia = await connect(bia_token)
    bia_peer = (await bia.receive_json_from())["peerId"]
    await bia.receive_json_from()
    await ana.receive_json_from()

    await ana.send_json_to({"type": "call.join", "media": {"audio": True, "video": False}})
    accepted = await receive_until(ana, "call.accepted")
    assert accepted["participants"] == []

    await bia.send_json_to({"type": "call.join", "media": {"audio": True, "video": True}})
    accepted = await receive_until(bia, "call.accepted")
    assert [p["peerId"] for p in accepted["participants"]] == [ana_peer]

    offer = {"type": "offer", "sdp": "v=0\r\n"}
    await bia.send_json_to({"type": "rtc.offer", "to": ana_peer, "sdp": offer})
    relayed = await receive_until(ana, "rtc.offer")
    assert relayed["from"] == bia_peer
    assert relayed["sdp"] == offer

    await bia.send_json_to({"type": "call.reaction", "emoji": "🔥"})
    reaction = await receive_until(ana, "call.reaction")
    assert reaction == {"type": "call.reaction", "peerId": bia_peer, "emoji": "🔥"}

    await bia.send_json_to({"type": "call.caption", "text": "bom dia", "final": True})
    caption = await receive_until(ana, "call.caption")
    assert caption["text"] == "bom dia" and caption["displayName"] == "Bia"

    await ana.disconnect()
    await bia.disconnect()
