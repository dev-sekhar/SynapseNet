import os
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException

os.environ.setdefault("SYNAPSENET_FABRIC_ADAPTER_TOKEN", "test-adapter-token")
os.environ.setdefault("SYNAPSENET_SESSION_SECRET", "test-session-secret")
os.environ["SYNAPSENET_ENCRYPTION_KEY"] = "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg="

from app import main


class UnavailableGatewayClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _traceback):
        return None

    async def get(self, _path, *, cookies):
        request = httpx.Request("GET", "http://gateway.test/api/session")
        raise httpx.ConnectError("gateway unavailable", request=request)


@pytest.mark.asyncio
async def test_migration_context_returns_502_when_gateway_is_unavailable(monkeypatch):
    monkeypatch.setattr(
        main.httpx,
        "AsyncClient",
        lambda **_kwargs: UnavailableGatewayClient(),
    )
    request = AsyncMock()
    request.cookies = {}

    with pytest.raises(HTTPException) as raised:
        await main.migration_context(request)

    assert raised.value.status_code == 502
    assert raised.value.detail == "Compatibility gateway is unavailable"
