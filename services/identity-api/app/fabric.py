from typing import Any

import httpx

from .config import settings


async def fabric_transaction(
    contract: str, transaction: str, args: list[str], *, submit: bool,
    identity: dict[str, str] | None = None,
) -> Any:
    async with httpx.AsyncClient(
        base_url=settings().fabric_adapter_url,
        headers={"Authorization": f"Bearer {settings().fabric_adapter_token}"},
        timeout=60,
    ) as client:
        response = await client.post(
            "/v1/transactions",
            json={
                "contract": contract,
                "transaction": transaction,
                "args": args,
                "submit": submit,
                "identity": identity,
            },
        )
    if response.status_code >= 400:
        raise RuntimeError(response.json().get("detail", "Fabric transaction failed"))
    return response.json()["result"]


async def credential_transactions() -> dict[str, Any]:
    async with httpx.AsyncClient(
        base_url=settings().fabric_adapter_url,
        headers={"Authorization": f"Bearer {settings().fabric_adapter_token}"},
        timeout=60,
    ) as client:
        response = await client.get("/v1/ledger/credential-transactions")
    if response.status_code >= 400:
        raise RuntimeError(response.json().get("detail", "Fabric transaction index failed"))
    return response.json()


async def audit_events(limit: int = 100) -> dict[str, Any]:
    async with httpx.AsyncClient(
        base_url=settings().fabric_adapter_url,
        headers={"Authorization": f"Bearer {settings().fabric_adapter_token}"},
        timeout=60,
    ) as client:
        response = await client.get("/v1/audit/events", params={"limit": limit})
    if response.status_code >= 400:
        raise RuntimeError(response.json().get("detail", "Fabric audit index failed"))
    return response.json()
