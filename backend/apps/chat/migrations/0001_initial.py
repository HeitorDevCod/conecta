import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Room",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=60, verbose_name="nome")),
                ("slug", models.SlugField(max_length=70, unique=True, verbose_name="slug")),
                ("description", models.CharField(blank=True, max_length=200, verbose_name="descrição")),
                ("color", models.CharField(default="#ff2e88", max_length=7, verbose_name="cor")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="criada em")),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="rooms_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("members", models.ManyToManyField(blank=True, related_name="rooms", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "sala",
                "verbose_name_plural": "salas",
                "ordering": ("-created_at",),
            },
        ),
        migrations.CreateModel(
            name="Message",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "kind",
                    models.CharField(
                        choices=[("text", "Texto"), ("system", "Sistema")], default="text", max_length=10
                    ),
                ),
                ("content", models.TextField(verbose_name="conteúdo")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="enviada em")),
                (
                    "author",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="messages",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "room",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="chat.room",
                    ),
                ),
            ],
            options={
                "verbose_name": "mensagem",
                "verbose_name_plural": "mensagens",
                "ordering": ("-created_at",),
                "indexes": [models.Index(fields=["room", "-created_at"], name="chat_msg_room_created_idx")],
            },
        ),
    ]
