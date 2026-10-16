from django.conf import settings
from django.utils.text import slugify
from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

from .models import Message, Room

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


class RoomSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    memberCount = serializers.IntegerField(source="member_count", read_only=True)
    isMember = serializers.BooleanField(source="is_member", read_only=True)
    color = serializers.RegexField(HEX_COLOR, required=False)

    class Meta:
        model = Room
        fields = ("id", "name", "slug", "description", "color", "createdAt", "memberCount", "isMember")
        read_only_fields = ("id", "slug")

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("O nome precisa ter pelo menos 3 caracteres.")
        return value

    def create(self, validated_data: dict) -> Room:
        base = slugify(validated_data["name"])[:60] or "sala"
        slug = base
        counter = 1
        while Room.objects.filter(slug=slug).exists():
            counter += 1
            slug = f"{base}-{counter}"
        return Room.objects.create(slug=slug, **validated_data)


class MessageSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    roomSlug = serializers.CharField(source="room.slug", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Message
        fields = ("id", "roomSlug", "author", "kind", "content", "createdAt")


def clean_message_content(raw: object) -> str:
    """Normaliza e valida o conteúdo vindo do WebSocket."""
    if not isinstance(raw, str):
        raise ValueError("Conteúdo inválido.")
    content = raw.strip()
    if not content:
        raise ValueError("A mensagem está vazia.")
    if len(content) > settings.CHAT_MESSAGE_MAX_LENGTH:
        raise ValueError(f"Limite de {settings.CHAT_MESSAGE_MAX_LENGTH} caracteres.")
    return content
