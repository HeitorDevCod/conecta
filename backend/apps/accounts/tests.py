import re
from urllib.parse import parse_qs, urlparse

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.tokens import make_email_token, make_reset_params

pytestmark = pytest.mark.django_db
User = get_user_model()
PASSWORD = "senha-forte-123"


def make_user(email: str = "bia@example.com", verified: bool = False):
    return User.objects.create_user(
        username=email.split("@")[0],
        email=email,
        display_name="Bia",
        password=PASSWORD,
        email_verified=verified,
    )


def link_from(message) -> dict[str, str]:
    url = re.search(r"https?://\S+", message.body).group(0)
    return {key: values[0] for key, values in parse_qs(urlparse(url).query).items()}


# ------------------------------------------------------------------ cadastro e login


def test_register_returns_tokens_and_sends_verification(django_capture_on_commit_callbacks) -> None:
    with django_capture_on_commit_callbacks(execute=True):
        response = APIClient().post(
            "/api/auth/register/",
            {"email": "Ana@Example.com", "displayName": "Ana", "password": PASSWORD},
            format="json",
        )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "ana@example.com"
    assert body["user"]["emailVerified"] is False
    assert body["access"] and body["refresh"]

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["ana@example.com"]
    assert "/confirmar-email?token=" in mail.outbox[0].body
    assert mail.outbox[0].alternatives, "o e-mail deve ter versão HTML"


def test_register_rejects_duplicate_email() -> None:
    make_user("ana@example.com")
    response = APIClient().post(
        "/api/auth/register/",
        {"email": "ana@example.com", "displayName": "Outra", "password": PASSWORD},
        format="json",
    )
    assert response.status_code == 400
    assert "email" in response.json()


def test_login_with_email_and_fetch_me() -> None:
    make_user()
    client = APIClient()
    token = client.post("/api/auth/token/", {"email": "bia@example.com", "password": PASSWORD}, format="json")
    assert token.status_code == 200

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.json()['access']}")
    me = client.get("/api/auth/me/").json()
    assert me["displayName"] == "Bia"
    assert me["emailVerified"] is False


# ------------------------------------------------------------------ confirmação de e-mail


def test_verify_email_with_valid_token() -> None:
    user = make_user()
    response = APIClient().post("/api/auth/verify-email/", {"token": make_email_token(user)}, format="json")
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.email_verified is True


def test_verify_email_rejects_tampered_token() -> None:
    user = make_user()
    token = make_email_token(user)[:-2] + "xx"
    response = APIClient().post("/api/auth/verify-email/", {"token": token}, format="json")
    assert response.status_code == 400
    user.refresh_from_db()
    assert user.email_verified is False


def test_verify_email_token_dies_when_email_changes() -> None:
    user = make_user()
    token = make_email_token(user)
    user.email = "nova@example.com"
    user.save()
    assert APIClient().post("/api/auth/verify-email/", {"token": token}, format="json").status_code == 400


def test_resend_verification_sends_new_link() -> None:
    user = make_user()
    client = APIClient()
    client.force_authenticate(user)
    response = client.post("/api/auth/verify-email/resend/")
    assert response.status_code == 200
    assert len(mail.outbox) == 1

    token = link_from(mail.outbox[0])["token"]
    assert APIClient().post("/api/auth/verify-email/", {"token": token}, format="json").status_code == 200


def test_resend_is_rate_limited() -> None:
    client = APIClient()
    client.force_authenticate(make_user())
    codes = [client.post("/api/auth/verify-email/resend/").status_code for _ in range(10)]
    assert 429 in codes


# ------------------------------------------------------------------ recuperação de senha


def test_password_reset_request_does_not_reveal_accounts() -> None:
    make_user()
    client = APIClient()
    existing = client.post("/api/auth/password-reset/", {"email": "bia@example.com"}, format="json")
    missing = client.post("/api/auth/password-reset/", {"email": "ninguem@example.com"}, format="json")
    assert existing.status_code == missing.status_code == 200
    assert existing.json() == missing.json()
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["bia@example.com"]


def test_password_reset_full_flow() -> None:
    make_user()
    client = APIClient()
    client.post("/api/auth/password-reset/", {"email": "BIA@example.com"}, format="json")
    params = link_from(mail.outbox[0])
    assert set(params) == {"uid", "token"}

    new_password = "outra-senha-boa-456"
    confirm = client.post(
        "/api/auth/password-reset/confirm/", {**params, "password": new_password}, format="json"
    )
    assert confirm.status_code == 200

    user = User.objects.get(email="bia@example.com")
    assert user.check_password(new_password)
    assert user.email_verified is True  # o link provou a posse do e-mail

    login = client.post("/api/auth/token/", {"email": "bia@example.com", "password": new_password}, format="json")
    assert login.status_code == 200


def test_password_reset_link_works_only_once() -> None:
    user = make_user()
    uid, token = make_reset_params(user)
    client = APIClient()
    payload = {"uid": uid, "token": token, "password": "outra-senha-boa-456"}
    assert client.post("/api/auth/password-reset/confirm/", payload, format="json").status_code == 200
    again = client.post("/api/auth/password-reset/confirm/", payload, format="json")
    assert again.status_code == 400
    assert "token" in again.json()


def test_password_reset_rejects_weak_password() -> None:
    user = make_user()
    uid, token = make_reset_params(user)
    response = APIClient().post(
        "/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "password": "12345678"}, format="json"
    )
    assert response.status_code == 400
    user.refresh_from_db()
    assert user.check_password(PASSWORD)
