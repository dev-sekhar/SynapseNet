import hashlib
import html
import secrets
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .database import database_session
from .fabric import credential_transactions, fabric_transaction
from .models import OrganizationApplication, WalletChallenge, WalletIdentity
from .schemas import (
    WalletChallengeRequest,
    WalletChallengeResponse,
    WalletLinkRequest,
    WalletLinkResponse,
    OrganizationApplicationRequest,
    OrganizationApplicationResponse,
    IncidentAppealRequest,
    IncidentReportRequest,
    WalletSession,
    WalletVerifyRequest,
)
from .security import new_challenge, normalize_address, recover_address

app = FastAPI(
    title="SynapseNet Application API",
    version="2.0.0",
    description="Privacy-first MetaMask authorization and Fabric orchestration boundary.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings().session_secret,
    https_only=settings().cookie_secure,
    same_site="lax",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "http://127.0.0.1:3002",
        "http://localhost:3002",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Request-ID"],
)


@app.middleware("http")
async def request_id(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID", secrets.token_hex(12))
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


def documentation_root() -> Path:
    configured = settings().docs_dir
    return Path(configured).resolve() if configured else Path(__file__).resolve().parents[3] / "docs"


@app.get("/docs", response_class=HTMLResponse, include_in_schema=False)
async def project_documentation(document: str | None = Query(default=None)):
    root = documentation_root().resolve()
    documents = sorted(root.rglob("*.md")) if root.is_dir() else []
    relative_documents = [path.relative_to(root).as_posix() for path in documents]
    selected = document if document in relative_documents else (
        "ProjectStructure.md" if "ProjectStructure.md" in relative_documents
        else relative_documents[0] if relative_documents else None
    )
    content = "No project documentation is available in this deployment."
    if selected:
        content = (root / selected).read_text(encoding="utf-8")
    navigation = "".join(
        f'<a class="{"active" if item == selected else ""}" href="/docs?document={quote(item)}">'
        f'{html.escape(item.removesuffix(".md").replace("/", " / ").replace("_", " "))}</a>'
        for item in relative_documents
    )
    return HTMLResponse(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SynapseNet Documentation</title><style>
*{{box-sizing:border-box}}body{{margin:0;color:#172033;background:#f6f7fb;font-family:"Roboto","Arial",sans-serif}}
header{{height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;color:white;background:#172033}}
header strong{{font-size:20px}}header nav{{display:flex;gap:18px}}header a{{color:#9ee5d3;text-decoration:none;font-weight:700}}
main{{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:calc(100vh - 68px)}}
aside{{padding:24px 16px;border-right:1px solid #dfe3ec;background:white}}aside h2{{margin:0 12px 16px;font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#687386}}
aside a{{display:block;padding:10px 12px;border-radius:7px;color:#394357;text-decoration:none;font-size:14px}}aside a:hover,aside a.active{{color:#4d3ec5;background:#efedff}}
article{{min-width:0;padding:32px clamp(24px,5vw,76px)}}article h1{{margin-top:0;font-size:32px}}pre{{margin:0;padding:30px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dfe3ec;border-radius:12px;background:white;font:14px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}}
@media(max-width:760px){{main{{grid-template-columns:1fr}}aside{{border-right:0;border-bottom:1px solid #dfe3ec}}}}
</style></head><body><header><strong>SynapseNet Documentation</strong><nav><a href="http://localhost:3001/">Home</a><a href="/api/docs">Swagger API</a><a href="/api/redoc">ReDoc</a></nav></header>
<main><aside><h2>Project documents</h2>{navigation}</aside><article><h1>{html.escape(selected or "Documentation")}</h1><pre>{html.escape(content)}</pre></article></main>
</body></html>""")


@app.post("/api/v2/auth/wallet/challenge", response_model=WalletChallengeResponse)
async def create_wallet_challenge(
    payload: WalletChallengeRequest,
    session: AsyncSession = Depends(database_session),
):
    address = normalize_address(payload.address)
    message, _, expires_at = new_challenge(address)
    nonce = message.split("Nonce: ", 1)[1].splitlines()[0]
    challenge = WalletChallenge(
        nonce_hash=hashlib.sha256(nonce.encode()).hexdigest(),
        address=address,
        message=message,
        expires_at=expires_at,
    )
    session.add(challenge)
    await session.commit()
    return WalletChallengeResponse(
        message=message,
        expires_in_seconds=settings().wallet_challenge_ttl_seconds,
    )


@app.post("/api/v2/auth/wallet/verify", response_model=WalletSession)
async def verify_wallet(
    payload: WalletVerifyRequest,
    request: Request,
    session: AsyncSession = Depends(database_session),
):
    address = normalize_address(payload.address)
    result = await session.execute(
        select(WalletChallenge)
        .where(WalletChallenge.address == address, WalletChallenge.consumed_at.is_(None))
        .order_by(WalletChallenge.expires_at.desc())
        .limit(1)
    )
    challenge = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if not challenge or challenge.expires_at.replace(tzinfo=UTC) <= now:
        raise HTTPException(401, "Wallet challenge is missing or expired")
    if recover_address(challenge.message, payload.signature) != address:
        raise HTTPException(401, "Wallet signature does not match the requested address")

    challenge.consumed_at = now
    identity = await session.get(WalletIdentity, address)
    if identity is None:
        identity = WalletIdentity(address=address)
        session.add(identity)
    identity.last_verified_at = now
    await session.commit()
    request.session["wallet_address"] = address
    return WalletSession(address=address)


@app.get("/api/v2/auth/wallet/session", response_model=WalletSession)
async def wallet_session(request: Request):
    address = request.session.get("wallet_address")
    if not address:
        raise HTTPException(401, "Connect and verify a wallet")
    return WalletSession(address=address)


@app.post("/api/v2/wallet/link", response_model=WalletLinkResponse)
async def link_wallet(
    payload: WalletLinkRequest,
    request: Request,
    session: AsyncSession = Depends(database_session),
):
    address = request.session.get("wallet_address")
    if not address or normalize_address(payload.intent.walletAddress) != address:
        raise HTTPException(401, "Verify the wallet that signed this intent")
    actor = (await migration_context(request)).get("actor")
    if not actor or actor["actorId"] != payload.intent.actorId:
        raise HTTPException(403, "The signed actor does not match the authenticated account")
    identity = await session.get(WalletIdentity, address)
    if identity and identity.actor_id and identity.actor_id != actor["actorId"]:
        raise HTTPException(
            409,
            f"This MetaMask account is already linked to {identity.actor_id}; "
            f"select the account assigned to {actor['actorId']}",
        )
    existing_actor_result = await session.execute(
        select(WalletIdentity).where(WalletIdentity.actor_id == actor["actorId"]).limit(1)
    )
    existing_actor_identity = existing_actor_result.scalar_one_or_none()
    if existing_actor_identity and existing_actor_identity.address != address:
        raise HTTPException(
            409,
            f"{actor['actorId']} is already linked to "
            f"{existing_actor_identity.address}; select that MetaMask account",
        )
    actor_type = "reviewer" if actor["role"] == "reviewer" else "user"
    try:
        actor_id = await fabric_transaction(
            "trust-manager",
            "registerParticipant",
            [
                actor["actorId"],
                actor_type,
                payload.intent.walletAddress,
                "Org1MSP",
                payload.intent.model_dump_json(),
                payload.signature,
            ],
            submit=True,
        )
    except RuntimeError as error:
        raise HTTPException(400, str(error)) from error
    linked = WalletLinkResponse(
        actorId=actor_id,
        walletAddress=payload.intent.walletAddress.lower(),
        authoritativeMspId="Org1MSP",
    )
    if identity is None:
        identity = WalletIdentity(address=address)
        session.add(identity)
    identity.actor_id = linked.actorId
    identity.fabric_msp_id = linked.authoritativeMspId
    await session.commit()
    return linked


@app.get("/api/wallet")
async def compatibility_wallet(request: Request):
    if not request.session.get("wallet_address"):
        raise HTTPException(401, "Connect and verify a wallet")
    async with httpx.AsyncClient(base_url=settings().ledger_gateway_url, timeout=20) as client:
        response = await client.get("/api/wallet", cookies=request.cookies)
    if response.status_code >= 400:
        raise HTTPException(response.status_code, "Ledger wallet is not linked to this address yet")
    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type=response.headers.get("content-type", "application/json"),
    )


@app.get("/api/v2/transactions")
async def list_transactions(
    request: Request,
    status: str | None = Query(default=None),
    method: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, alias="pageSize", ge=1, le=100),
):
    if not request.session.get("wallet_address"):
        raise HTTPException(401, "Connect and verify a wallet")
    actor = (await migration_context(request)).get("actor")
    if not actor:
        raise HTTPException(401, "Sign in to a business profile")
    try:
        projection = await credential_transactions()
    except RuntimeError as error:
        raise HTTPException(502, str(error)) from error

    actor_id = actor["actorId"] if actor["role"] == "user" else actor.get("enterpriseId")
    items = []
    for ledger_item in projection.get("items", []):
        if actor["role"] == "user" and ledger_item.get("userId") != actor_id:
            continue
        if actor["role"] == "reviewer" and ledger_item.get("enterpriseId") != actor_id:
            continue
        if status and ledger_item.get("status") != status:
            continue
        if method and ledger_item.get("credentialType") != method:
            continue
        action = ledger_item.get("action")
        items.append({
            **ledger_item,
            "method": ledger_item.get("credentialType"),
            "from": ledger_item.get("userId") if action == "submit" else ledger_item.get("enterpriseId"),
            "to": ledger_item.get("enterpriseId") if action == "submit" else ledger_item.get("userId"),
        })
    items.sort(key=lambda item: (int(item.get("blockNumber", 0)), item.get("transactionHash", "")), reverse=True)
    total = len(items)
    start = (page - 1) * page_size
    index_state = projection.get("indexing", {"ready": True})
    return {
        "items": items[start : start + page_size],
        "page": page,
        "pageSize": page_size,
        "total": total,
        "indexing": {
            "ready": index_state.get("ready", False),
            "error": None if index_state.get("ready") else "Peer event stream unavailable",
        },
    }


@app.get("/api/v2/migration/context")
async def migration_context(request: Request):
    try:
        async with httpx.AsyncClient(
            base_url=settings().ledger_gateway_url,
            timeout=10,
        ) as client:
            response = await client.get("/api/session", cookies=request.cookies)
    except httpx.RequestError as error:
        raise HTTPException(
            502,
            "Compatibility gateway is unavailable",
        ) from error
    if response.status_code >= 400:
        raise HTTPException(response.status_code, "Compatibility session lookup failed")
    return response.json()


@app.post(
    "/api/v2/organizations/applications",
    response_model=OrganizationApplicationResponse,
    status_code=201,
)
async def apply_for_organization(
    payload: OrganizationApplicationRequest,
    request: Request,
    session: AsyncSession = Depends(database_session),
):
    address = request.session.get("wallet_address")
    if not address:
        raise HTTPException(401, "Verify a MetaMask wallet before applying")
    application_id = f"org-application-{secrets.token_hex(12)}"
    application = OrganizationApplication(
        application_id=application_id,
        legal_name=payload.legalName,
        display_name=payload.displayName,
        jurisdiction=payload.jurisdiction,
        registration_number=payload.registrationNumber,
        requested_msp_id=payload.requestedMspId,
        applicant_wallet=address,
        status="pending_governance",
    )
    session.add(application)
    await session.commit()
    return OrganizationApplicationResponse(
        applicationId=application_id,
        status=application.status,
    )


async def linked_identity(request: Request, session: AsyncSession) -> WalletIdentity:
    address = request.session.get("wallet_address")
    identity = await session.get(WalletIdentity, address) if address else None
    if not identity or not identity.actor_id:
        raise HTTPException(403, "Link this wallet to a registered actor first")
    return identity


@app.post("/api/v2/incidents", status_code=201)
async def report_incident(
    payload: IncidentReportRequest,
    request: Request,
    session: AsyncSession = Depends(database_session),
):
    identity = await linked_identity(request, session)
    if payload.intent.actorId != identity.actor_id or payload.intent.action != "reportIncident":
        raise HTTPException(403, "Signed intent does not match the linked actor")
    incident = {
        "incidentId": payload.incidentId,
        "accusedActorId": payload.accusedActorId,
        "reporterActorId": identity.actor_id,
        "allegationHash": payload.allegationHash,
    }
    if payload.credentialId:
        incident["credentialId"] = payload.credentialId
    incident_id = await fabric_transaction(
        "trust-manager",
        "reportIncident",
        [__import__("json").dumps(incident, separators=(",", ":"), sort_keys=True),
         payload.intent.model_dump_json(), payload.signature],
        submit=True,
    )
    return {"incidentId": incident_id}


@app.post("/api/v2/incidents/{incident_id}/appeal", status_code=204)
async def appeal_incident(
    incident_id: str,
    payload: IncidentAppealRequest,
    request: Request,
    session: AsyncSession = Depends(database_session),
):
    identity = await linked_identity(request, session)
    if payload.intent.actorId != identity.actor_id or payload.intent.action != "appealIncident":
        raise HTTPException(403, "Signed intent does not match the linked actor")
    await fabric_transaction(
        "trust-manager",
        "appealIncident",
        [incident_id, payload.intent.model_dump_json(), payload.signature],
        submit=True,
    )
    return Response(status_code=204)


@app.get("/api/v2/credentials/{credential_id}/trust-status")
async def credential_trust_status(credential_id: str):
    return await fabric_transaction(
        "trust-manager", "getCredentialTrustStatus", [credential_id], submit=False
    )
