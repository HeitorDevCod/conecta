import random

from django.contrib.auth.models import AbstractUser
from django.db import models

AVATAR_COLORS: tuple[str, ...] = (
    "#ffa53a",  # âmbar
    "#5cc8ff",  # azul-gelo
    "#2ee6a6",  # jade
    "#ff5d73",  # coral
    "#b48cff",  # lilás
    "#ff8f5a",  # tangerina
)


def random_avatar_color() -> str:
    return random.choice(AVATAR_COLORS)


class User(AbstractUser):
    """Usuário da plataforma, autenticado por e-mail e senha."""

    email = models.EmailField("e-mail", unique=True)
    display_name = models.CharField("nome de exibição", max_length=40)
    avatar_color = models.CharField("cor do avatar", max_length=7, default=random_avatar_color)
    email_verified = models.BooleanField("e-mail confirmado", default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username", "display_name"]

    class Meta:
        verbose_name = "usuário"
        verbose_name_plural = "usuários"

    def __str__(self) -> str:
        return self.display_name or self.email
