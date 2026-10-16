from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .emails import send_password_reset_email, send_verification_email
from .serializers import (
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)
from .tokens import read_email_token

User = get_user_model()


class EmailThrottleMixin:
    """Limita ações que disparam e-mail, evitando spam na caixa de alguém."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_email"


class RegisterView(generics.GenericAPIView):
    """Cria a conta, envia o e-mail de confirmação e já devolve os tokens."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request: Request) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        transaction.on_commit(lambda: send_verification_email(user))
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class VerifyEmailView(APIView):
    """Confirma o e-mail a partir do token do link. Não exige estar logado."""

    permission_classes = [permissions.AllowAny]

    def post(self, request: Request) -> Response:
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = read_email_token(serializer.validated_data["token"])
        if user is None:
            return Response(
                {"detail": "Este link de confirmação é inválido ou expirou. Peça um novo pelo site."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.email_verified:
            user.email_verified = True
            user.save(update_fields=["email_verified"])
        return Response({"detail": "E-mail confirmado!", "email": user.email})


class ResendVerificationView(EmailThrottleMixin, APIView):
    def post(self, request: Request) -> Response:
        user = request.user
        if user.email_verified:
            return Response({"detail": "Seu e-mail já está confirmado."})
        send_verification_email(user)
        return Response({"detail": f"Enviamos um novo link para {user.email}."})


class PasswordResetRequestView(EmailThrottleMixin, APIView):
    """Sempre responde igual, exista ou não a conta, para não revelar quem está cadastrado."""

    permission_classes = [permissions.AllowAny]

    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
        if user is not None:
            send_password_reset_email(user)
        return Response(
            {"detail": "Se existir uma conta com esse e-mail, você vai receber um link para redefinir a senha."}
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["password"])
        # quem recebeu o link no e-mail provou que é dono do endereço
        user.email_verified = True
        user.save(update_fields=["password", "email_verified"])
        return Response({"detail": "Senha redefinida! Entre com a nova senha."})
