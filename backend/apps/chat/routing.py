from django.urls import re_path

from .consumers import RoomConsumer

websocket_urlpatterns = [
    re_path(r"^ws/rooms/(?P<slug>[-a-zA-Z0-9_]+)/$", RoomConsumer.as_asgi()),
]
