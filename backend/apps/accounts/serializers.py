from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils.text import slugify
from rest_framework import serializers

from .tokens import read_reset_params

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    displayName = serializers.CharField(source="display_name", min_length=2, max_length=40)
    avatarColor = serializers.CharField(source="avatar_color", read_only=True)
    emailVerified = serializers.BooleanField(source="email_verified", read_only=True)

    class Meta:
        model = User
        fields = ("id", "email", "displayName", "avatarColor", "emailVerified")
        read_only_fields = ("id", "email")


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate(self, attrs: dict) -> dict:
        user = read_reset_params(attrs["uid"], attrs["token"])
        if user is None:
            raise serializers.ValidationError(
                {"token": "Este link é inválido ou já expirou. Peça um novo para redefinir sua senha."}
            )
        validate_password(attrs["password"], user=user)
        attrs["user"] = user
        return attrs


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    displayName = serializers.CharField(min_length=2, max_length=40)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Este e-mail já está cadastrado.")
        return value

    def validate_displayName(self, value: str) -> str:  # noqa: N802 - nome do campo da API
        return value.strip()

    def validate(self, attrs: dict) -> dict:
        candidate = User(email=attrs["email"], display_name=attrs["displayName"])
        validate_password(attrs["password"], user=candidate)
        return attrs

    def create(self, validated_data: dict):
        base = slugify(validated_data["email"].split("@")[0]) or "user"
        username = base
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{base}{suffix}"
        return User.objects.create_user(
            username=username,
            email=validated_data["email"],
            display_name=validated_data["displayName"],
            password=validated_data["password"],
        )
