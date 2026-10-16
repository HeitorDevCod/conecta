import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_register_returns_tokens_and_user() -> None:
    client = APIClient()
    response = client.post(
        "/api/auth/register/",
        {"email": "Ana@Example.com", "displayName": "Ana", "password": "senha-forte-123"},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "ana@example.com"
    assert body["user"]["displayName"] == "Ana"
    assert body["access"] and body["refresh"]


def test_register_rejects_duplicate_email() -> None:
    get_user_model().objects.create_user(
        username="ana", email="ana@example.com", display_name="Ana", password="senha-forte-123"
    )
    response = APIClient().post(
        "/api/auth/register/",
        {"email": "ana@example.com", "displayName": "Outra", "password": "senha-forte-123"},
        format="json",
    )
    assert response.status_code == 400
    assert "email" in response.json()


def test_login_with_email_and_fetch_me() -> None:
    get_user_model().objects.create_user(
        username="bia", email="bia@example.com", display_name="Bia", password="senha-forte-123"
    )
    client = APIClient()
    token = client.post(
        "/api/auth/token/", {"email": "bia@example.com", "password": "senha-forte-123"}, format="json"
    )
    assert token.status_code == 200

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.json()['access']}")
    me = client.get("/api/auth/me/")
    assert me.status_code == 200
    assert me.json()["displayName"] == "Bia"
