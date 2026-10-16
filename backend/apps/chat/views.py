from datetime import datetime

from django.conf import settings
from django.db.models import Count, Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.request import Request
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmailVerified

from .models import Message, Room
from .serializers import MessageSerializer, RoomSerializer

MESSAGE_PAGE_SIZE = 50


class RoomViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = RoomSerializer
    lookup_field = "slug"

    def get_permissions(self):
        # Ver a lista de salas é livre; criar, entrar e ler mensagens exige e-mail confirmado.
        if self.action in ("list", "retrieve", "leave"):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsEmailVerified()]

    def get_queryset(self):
        membership = Room.members.through.objects.filter(room_id=OuterRef("pk"), user_id=self.request.user.pk)
        return Room.objects.annotate(
            member_count=Count("members", distinct=True),
            is_member=Exists(membership),
        )

    def perform_create(self, serializer: RoomSerializer) -> None:
        room = serializer.save(created_by=self.request.user)
        room.members.add(self.request.user)

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        room = self.get_queryset().get(pk=serializer.instance.pk)
        return Response(self.get_serializer(room).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def join(self, request: Request, slug: str | None = None) -> Response:
        room = get_object_or_404(Room, slug=slug)
        room.members.add(request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=room.pk)).data)

    @action(detail=True, methods=["post"])
    def leave(self, request: Request, slug: str | None = None) -> Response:
        room = get_object_or_404(Room, slug=slug)
        room.members.remove(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def messages(self, request: Request, slug: str | None = None) -> Response:
        """Histórico paginado por cursor de tempo: ?before=<ISO-8601>."""
        room = get_object_or_404(Room, slug=slug)
        if not room.members.filter(pk=request.user.pk).exists():
            return Response({"detail": "Entre na sala para ver as mensagens."}, status=status.HTTP_403_FORBIDDEN)

        qs = Message.objects.filter(room=room).select_related("author", "room")
        before_raw = request.query_params.get("before")
        if before_raw:
            before: datetime | None = parse_datetime(before_raw)
            if before is None:
                return Response({"detail": "Parâmetro 'before' inválido."}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(created_at__lt=before)

        page = list(qs.order_by("-created_at")[: MESSAGE_PAGE_SIZE + 1])
        has_more = len(page) > MESSAGE_PAGE_SIZE
        page = page[:MESSAGE_PAGE_SIZE]
        page.reverse()  # ordem cronológica para o cliente
        return Response({"results": MessageSerializer(page, many=True).data, "hasMore": has_more})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsEmailVerified])
def rtc_config(_request: Request) -> Response:
    """Servidores ICE usados pelo navegador para estabelecer as conexões WebRTC."""
    ice_servers: list[dict] = []
    if settings.STUN_URLS:
        ice_servers.append({"urls": settings.STUN_URLS})
    if settings.TURN_URLS:
        ice_servers.append(
            {
                "urls": settings.TURN_URLS,
                "username": settings.TURN_USERNAME,
                "credential": settings.TURN_CREDENTIAL,
            }
        )
    return Response({"iceServers": ice_servers, "maxParticipants": settings.CALL_MAX_PARTICIPANTS})
