import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _isolated_cache():
    """Zera o cache (e os contadores de throttling) entre os testes."""
    cache.clear()
    yield
    cache.clear()
