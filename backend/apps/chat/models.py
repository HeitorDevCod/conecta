import uuid

from django.conf import settings
from django.db import models


class Room(models.Model):
    """Sala de conversa. Texto, voz e vídeo acontecem dentro de uma sala."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField("nome", max_length=60)
    slug = models.SlugField("slug", max_length=70, unique=True)
    description = models.CharField("descrição", max_length=200, blank=True)
    color = models.CharField("cor", max_length=7, default="#ffa53a")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="rooms_created"
    )
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="rooms", blank=True)
    created_at = models.DateTimeField("criada em", auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "sala"
        verbose_name_plural = "salas"

    def __str__(self) -> str:
        return self.name


class Message(models.Model):
    class Kind(models.TextChoices):
        TEXT = "text", "Texto"
        SYSTEM = "system", "Sistema"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="messages"
    )
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.TEXT)
    content = models.TextField("conteúdo")
    created_at = models.DateTimeField("enviada em", auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("room", "-created_at"), name="chat_msg_room_created_idx")]
        verbose_name = "mensagem"
        verbose_name_plural = "mensagens"

    def __str__(self) -> str:
        return f"{self.author}: {self.content[:40]}"
