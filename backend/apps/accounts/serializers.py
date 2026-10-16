from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils.text import slugify
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    displayName = serializers.CharField(source="display_name")
    avatarColor = serializers.CharField(source="avatar_color", read_only=True)

    class Meta:
        model = User
        fields = ("id", "email", "displayName", "avatarColor")
        read_only_fields = ("id", "email")


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
