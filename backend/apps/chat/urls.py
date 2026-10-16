from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import RoomViewSet, rtc_config

router = DefaultRouter()
router.register("rooms", RoomViewSet, basename="room")

urlpatterns = [
    path("", include(router.urls)),
    path("rtc/config/", rtc_config, name="rtc-config"),
]
