import base64
import asyncio
import hashlib
import html
import io
import json
import secrets
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

import httpx
import qrcode
from cryptography.exceptions import InvalidTag
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .database import database_session, session_factory
from .fabric import audit_events, credential_transactions, fabric_transaction
from .models import EncryptedMetadata, OrganizationApplication, WalletChallenge, WalletIdentity
from .schemas import (
    WalletChallengeRequest,
    WalletChallengeResponse,
    WalletLinkRequest,
    WalletLinkResponse,
    ProductionIdentityBindingRequest,
    OrganizationApplicationRequest,
    OrganizationApplicationResponse,
    OrganizationDecisionRequest,
    OrganizationDecisionResponse,
    IncidentAppealRequest,
    IncidentReportRequest,
    CredentialReviewRequest,
    CredentialShareRequest,
    CredentialSubmissionRequest,
    WalletSession,
    WalletVerifyRequest,
)
from .security import decrypt_metadata, encrypt_metadata, new_challenge, normalize_address, recover_address

app = FastAPI(
    title="SynapseNet Application API",
    version="2.0.0",
    description="Privacy-first MetaMask authorization and Fabric orchestration boundary.",
    docs_url=None,
    redoc_url=None,
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


DOCUMENTATION_TOP_BAR_CSS = """
.synapsenet-docs-bar{box-sizing:border-box;position:sticky;top:0;z-index:10000;height:68px;
display:flex;align-items:center;justify-content:space-between;padding:0 28px;color:#fff;background:#172033;
font-family:Roboto,Arial,sans-serif;box-shadow:0 1px 0 rgba(255,255,255,.1)}.synapsenet-docs-bar *{box-sizing:border-box}
.synapsenet-docs-brand{color:#fff!important;text-decoration:none;font-size:20px;font-weight:700}
.synapsenet-docs-bar nav{display:flex;align-items:center;gap:18px}.synapsenet-docs-bar nav a{color:#9ee5d3!important;
text-decoration:none;font-size:14px;font-weight:700;padding:8px 0;border-bottom:2px solid transparent}
.synapsenet-docs-bar nav a:hover,.synapsenet-docs-bar nav a.active{color:#fff!important;border-bottom-color:#9ee5d3}
@media(max-width:700px){.synapsenet-docs-bar{height:auto;
min-height:68px;align-items:flex-start;gap:10px;padding:16px;flex-direction:column}.synapsenet-docs-bar nav{gap:12px;flex-wrap:wrap}}
"""
API_DOCUMENTATION_CSS = """
html,body{margin:0;background:#f6f7fb!important;color:#172033;font-family:Roboto,Arial,sans-serif}
.swagger-ui{max-width:1500px;margin:0 auto;padding:20px clamp(16px,4vw,60px) 48px}
.swagger-ui .topbar{display:none}.swagger-ui,.swagger-ui .info .title,.swagger-ui .opblock-tag,
.swagger-ui button,.swagger-ui input,.swagger-ui select,.swagger-ui textarea{font-family:Roboto,Arial,sans-serif}
.swagger-ui .info{margin:24px 0 32px}.swagger-ui .info .title{color:#172033}
.swagger-ui .scheme-container{margin:0 0 24px;padding:20px;border:1px solid #dfe3ec;border-radius:12px;
box-shadow:none;background:#fff}.swagger-ui .opblock-tag{color:#172033;border-bottom-color:#dfe3ec}
.swagger-ui .opblock{border-radius:10px;box-shadow:none}.swagger-ui section.models{border-color:#dfe3ec;border-radius:12px;background:#fff}
.redoc-wrap{min-height:calc(100vh - 68px)!important;background:#f6f7fb!important}
.redoc-wrap,.redoc-wrap h1,.redoc-wrap h2,.redoc-wrap h3,.redoc-wrap h4,.redoc-wrap h5,
.redoc-wrap button,.redoc-wrap input{font-family:Roboto,Arial,sans-serif!important}
"""


def documentation_top_bar(active: str) -> str:
    links = (
        ("home", "http://localhost:3001/", "Home"),
        ("project", "/docs", "Project Docs"),
        ("swagger", "/api/docs", "Swagger API"),
        ("redoc", "/api/redoc", "ReDoc"),
    )
    navigation = "".join(
        f'<a class="{"active" if key == active else ""}" href="{href}">{label}</a>'
        for key, href, label in links
    )
    return (
        '<header class="synapsenet-docs-bar">'
        '<a class="synapsenet-docs-brand" href="/docs">SynapseNet Documentation</a>'
        f'<nav aria-label="Documentation navigation">{navigation}</nav></header>'
    )


def with_documentation_shell(page: HTMLResponse, active: str) -> HTMLResponse:
    markup = page.body.decode("utf-8")
    styles = DOCUMENTATION_TOP_BAR_CSS + API_DOCUMENTATION_CSS
    markup = markup.replace("</head>", f"<style>{styles}</style></head>")
    markup = markup.replace("<body>", f"<body>{documentation_top_bar(active)}", 1)
    return HTMLResponse(markup)


@app.get("/api/docs", response_class=HTMLResponse, include_in_schema=False)
async def swagger_documentation():
    return with_documentation_shell(get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Swagger API",
    ), "swagger")


@app.get("/api/redoc", response_class=HTMLResponse, include_in_schema=False)
async def redoc_documentation():
    return with_documentation_shell(get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - ReDoc",
    ), "redoc")


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
main{{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:calc(100vh - 68px)}}
aside{{padding:24px 16px;border-right:1px solid #dfe3ec;background:white}}aside h2{{margin:0 12px 16px;font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#687386}}
aside a{{display:block;padding:10px 12px;border-radius:7px;color:#394357;text-decoration:none;font-size:14px}}aside a:hover,aside a.active{{color:#4d3ec5;background:#efedff}}
article{{min-width:0;padding:32px clamp(24px,5vw,76px)}}article h1{{margin-top:0;font-size:32px}}pre{{margin:0;padding:30px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dfe3ec;border-radius:12px;background:white;font:14px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}}
@media(max-width:760px){{main{{grid-template-columns:1fr}}aside{{border-right:0;border-bottom:1px solid #dfe3ec}}}}
</style><style>{DOCUMENTATION_TOP_BAR_CSS}</style></head><body>{documentation_top_bar("project")}
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


@app.post("/api/v2/auth/wallet/logout", status_code=204)
async def wallet_logout(request: Request):
    request.session.clear()



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
async def wallet_overview(request: Request):
    actor = await authenticated_business_actor(request)
    owner_id = actor["actorId"] if actor["role"] == "user" else actor["enterpriseId"]
    credential_transaction = "getWallet" if actor["role"] == "user" else "getIssuedCredentials"
    try:
        wallet, credentials, requests, token_transactions = await asyncio.gather(
            fabric_transaction("skill-manager", "getWalletAccount", [owner_id], submit=False),
            fabric_transaction("skill-manager", credential_transaction, [owner_id], submit=False),
            fabric_transaction("skill-manager", "getCredentialRequests", [], submit=False),
            fabric_transaction("skill-manager", "getTokenTransactions", [owner_id], submit=False),
        )
        shared = await fabric_transaction(
            "skill-manager", "getSharedCredentials", [actor["actorId"]], submit=False
        ) if actor["role"] == "user" else []
    except RuntimeError as error:
        raise HTTPException(502, str(error)) from error
    relevant = [item for item in requests if (
        item.get("userId") == owner_id if actor["role"] == "user"
        else item.get("enterpriseId") == owner_id
    )]
    return {
        "wallet": wallet,
        "credentials": credentials,
        "credentialRequests": relevant,
        "sharedCredentials": shared,
        "credentialSummary": {
            "total": len(relevant),
            "approved": sum(item.get("status") == "approved" for item in relevant),
            "pending": sum(item.get("status") == "pending_validation" for item in relevant),
            "rejected": sum(item.get("status") == "rejected" for item in relevant),
        },
        "tokenTransactions": token_transactions,
    }


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


async def authenticated_business_actor(request: Request) -> dict:
    address = request.session.get("wallet_address")
    if address:
        async with session_factory() as session:
            identity = await session.get(WalletIdentity, address)
        if identity and identity.actor_id:
            users, enterprises = await asyncio.gather(
                fabric_transaction("skill-manager", "getUsers", [], submit=False),
                fabric_transaction("skill-manager", "getEnterprises", [], submit=False),
            )
            user = next((item for item in users if item.get("userId") == identity.actor_id), None)
            if user:
                return {"actorId": identity.actor_id, "role": "user", "displayName": user.get("displayName")}
            enterprise = next((
                item for item in enterprises if identity.actor_id in item.get("reviewers", [])
            ), None)
            if enterprise:
                return {
                    "actorId": identity.actor_id,
                    "role": "reviewer",
                    "displayName": identity.actor_id,
                    "enterpriseId": enterprise["enterpriseId"],
                }
    if settings().allow_legacy_business_sessions:
        actor = (await migration_context(request)).get("actor")
        if actor:
            return actor
    raise HTTPException(401, "Verify a provisioned wallet identity")


@app.get("/api/v2/auth/wallet/actor")
async def wallet_actor(request: Request):
    try:
        return {"actor": await authenticated_business_actor(request)}
    except RuntimeError as error:
        raise HTTPException(503, "Fabric identity lookup is temporarily unavailable") from error


@app.post("/api/v2/internal/identities", status_code=201)
async def provision_production_identity(
    payload: ProductionIdentityBindingRequest,
    x_operations_token: str | None = Header(default=None),
    session: AsyncSession = Depends(database_session),
):
    require_operations(x_operations_token)
    address = normalize_address(payload.walletAddress)
    existing = await session.get(WalletIdentity, address)
    actor_result = await session.execute(
        select(WalletIdentity).where(WalletIdentity.actor_id == payload.actorId).limit(1)
    )
    actor_identity = actor_result.scalar_one_or_none()
    if actor_identity and actor_identity.address != address:
        raise HTTPException(409, "Actor is already bound to another wallet")
    if existing and existing.actor_id and existing.actor_id != payload.actorId:
        raise HTTPException(409, "Wallet is already bound to another actor")
    identity = existing or WalletIdentity(address=address)
    if existing is None:
        session.add(identity)
    identity.actor_id = payload.actorId
    identity.fabric_msp_id = payload.fabricMspId
    await session.commit()
    return {"actorId": identity.actor_id, "walletAddress": address, "fabricMspId": identity.fabric_msp_id}


async def actor_fabric_identity(actor: dict) -> dict[str, str]:
    if actor["role"] == "user":
        users = await fabric_transaction("skill-manager", "getUsers", [], submit=False)
        record = next((item for item in users if item.get("userId") == actor["actorId"]), None)
    else:
        enterprises = await fabric_transaction("skill-manager", "getEnterprises", [], submit=False)
        record = next((item for item in enterprises if item.get("enterpriseId") == actor.get("enterpriseId")), None)
    if not record or not record.get("mspId"):
        raise HTTPException(403, "Actor does not have an authoritative Fabric MSP binding")
    return {
        "mspId": record["mspId"],
        "enrollmentId": actor["actorId"],
        "role": actor["role"],
    }


@app.get("/api/v2/credentials/bootstrap")
async def credential_bootstrap(request: Request):
    actor = await authenticated_business_actor(request)
    try:
        users, enterprises, requests = await asyncio.gather(
            fabric_transaction("skill-manager", "getUsers", [], submit=False),
            fabric_transaction("skill-manager", "getEnterprises", [], submit=False),
            fabric_transaction("skill-manager", "getCredentialRequests", [], submit=False),
        )
    except RuntimeError as error:
        raise HTTPException(502, str(error)) from error
    relevant = [item for item in requests if (
        item.get("userId") == actor["actorId"] if actor["role"] == "user"
        else item.get("enterpriseId") == actor.get("enterpriseId")
    )]
    return {
        "users": [item for item in users if actor["role"] != "user" or item.get("userId") == actor["actorId"]],
        "enterprises": enterprises,
        "directory": [{"userId": item["userId"], "displayName": item["displayName"]} for item in users],
        "credentialRequests": relevant,
    }


@app.post("/api/v2/credential-requests", status_code=201)
async def submit_credential(
    payload: CredentialSubmissionRequest,
    request: Request,
    session: AsyncSession = Depends(database_session),
):
    actor = await authenticated_business_actor(request)
    if actor["role"] != "user":
        raise HTTPException(403, "User access is required")
    body = payload.model_dump(mode="json")
    body.update({"requestId": f"request-{secrets.token_hex(12)}", "userId": actor["actorId"]})
    owner_address = request.session.get("wallet_address")
    if not owner_address and settings().require_wallet_for_credentials:
        raise HTTPException(401, "Connect and verify a wallet")
    if not owner_address:
        owner_address = "0x" + hashlib.sha256(actor["actorId"].encode()).hexdigest()[:40]
    for evidence in body["evidence"]:
        metadata_id = f"evidence-metadata-{secrets.token_hex(16)}"
        private_payload = json.dumps({
            "fileName": evidence["fileName"],
            "storageProvider": evidence["storageProvider"],
            "storageReference": evidence.pop("storageReference", ""),
        }, separators=(",", ":"), sort_keys=True).encode()
        ciphertext, nonce = encrypt_metadata(private_payload, metadata_id.encode())
        session.add(EncryptedMetadata(
            metadata_id=metadata_id,
            owner_address=owner_address,
            owner_actor_id=actor["actorId"],
            issuer_enterprise_id=payload.enterpriseId,
            evidence_id=evidence["evidenceId"],
            ledger_hash=evidence["contentHash"],
            ciphertext=ciphertext,
            nonce=nonce,
            schema_version="evidence-v1",
            key_version="v1",
        ))
        evidence["fileName"] = "encrypted"
        evidence["storageProvider"] = "synapsenet-private-metadata"
        evidence["storageReference"] = metadata_id
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(409, "Evidence identifiers must be unique") from error
    try:
        fabric_identity = await actor_fabric_identity(actor)
        request_id = await fabric_transaction(
            "skill-manager", "submitCredentialRequest",
            [json.dumps(body, separators=(",", ":"), sort_keys=True)], submit=True,
            identity=fabric_identity,
        )
    except RuntimeError as error:
        await session.rollback()
        raise HTTPException(400, str(error)) from error
    await session.commit()
    return {"requestId": request_id}


@app.get("/api/v2/evidence/{evidence_id}/metadata")
async def evidence_metadata(
    evidence_id: str,
    request: Request,
    session: AsyncSession = Depends(database_session),
):
    actor = await authenticated_business_actor(request)
    record = (await session.execute(
        select(EncryptedMetadata).where(EncryptedMetadata.evidence_id == evidence_id)
    )).scalar_one_or_none()
    if not record or record.deleted_at:
        raise HTTPException(404, "Evidence metadata does not exist")
    permitted = (
        actor["role"] == "user" and actor["actorId"] == record.owner_actor_id
    ) or (
        actor["role"] == "reviewer" and actor.get("enterpriseId") == record.issuer_enterprise_id
    )
    if not permitted:
        raise HTTPException(403, "Evidence metadata belongs to another credential workflow")
    try:
        private_payload = json.loads(decrypt_metadata(
            record.ciphertext, record.nonce, record.metadata_id.encode()
        ))
    except (InvalidTag, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(500, "Evidence metadata could not be decrypted") from error
    return {
        "evidenceId": evidence_id,
        "contentHash": record.ledger_hash,
        **private_payload,
    }


@app.post("/api/v2/credential-requests/{request_id}/review")
async def review_credential(
    request_id: str, payload: CredentialReviewRequest, request: Request
):
    actor = await authenticated_business_actor(request)
    if actor["role"] != "reviewer":
        raise HTTPException(403, "Reviewer access is required")
    try:
        fabric_identity = await actor_fabric_identity(actor)
        credential_id = await fabric_transaction(
            "skill-manager", "reviewCredentialRequest",
            [request_id, actor["actorId"], payload.decision, payload.notes], submit=True,
            identity=fabric_identity,
        )
    except RuntimeError as error:
        raise HTTPException(400, str(error)) from error
    return {"credentialId": credential_id or None}


@app.post("/api/v2/shares", status_code=201)
async def create_share(payload: CredentialShareRequest, request: Request):
    actor = await authenticated_business_actor(request)
    if actor["role"] != "user":
        raise HTTPException(403, "User access is required")
    share_id = f"share-{secrets.token_hex(12)}"
    body = payload.model_dump(mode="json")
    body.update({"shareId": share_id, "ownerId": actor["actorId"]})
    try:
        await fabric_transaction(
            "skill-manager", "createShareGrant",
            [json.dumps(body, separators=(",", ":"), sort_keys=True)], submit=True,
        )
    except RuntimeError as error:
        raise HTTPException(400, str(error)) from error
    share_url = f"{settings().public_app_url.rstrip('/')}/?share={quote(share_id)}"
    image = qrcode.make(share_url)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return {
        "shareId": share_id,
        "shareUrl": share_url,
        "qrDataUrl": f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode()}",
    }


@app.get("/api/v2/shares/{share_id}")
async def read_share(share_id: str, request: Request):
    actor = await authenticated_business_actor(request)
    try:
        result = await fabric_transaction(
            "skill-manager", "getShareGrant", [share_id], submit=False
        )
    except RuntimeError as error:
        raise HTTPException(404, str(error)) from error
    if actor["actorId"] not in (result["grant"]["ownerId"], result["grant"]["recipient"]):
        raise HTTPException(403, "This credential share was issued to a different recipient")
    if not result["accessible"]:
        raise HTTPException(403, "This share is expired, revoked, or not active")
    return result


@app.post("/api/v2/shares/{share_id}/revoke", status_code=204)
async def revoke_share(share_id: str, request: Request):
    actor = await authenticated_business_actor(request)
    if actor["role"] != "user":
        raise HTTPException(403, "User access is required")
    await fabric_transaction(
        "skill-manager", "revokeShareGrant", [share_id, actor["actorId"]], submit=True
    )
    return Response(status_code=204)


async def execute_penalty(directive: dict) -> dict:
    actor_id = directive["actorId"]
    users, enterprises = await asyncio.gather(
        fabric_transaction("skill-manager", "getUsers", [], submit=False),
        fabric_transaction("skill-manager", "getEnterprises", [], submit=False),
    )
    owner_id = actor_id if any(item["userId"] == actor_id for item in users) else next(
        (item["enterpriseId"] for item in enterprises
         if actor_id == item["enterpriseId"] or actor_id in item.get("reviewers", [])),
        None,
    )
    if not owner_id:
        raise RuntimeError(f"No credential wallet owns trust actor {actor_id}")
    execution = await fabric_transaction(
        "skill-manager", "executePenaltyDirective",
        [directive["directiveId"], actor_id, owner_id, str(directive["burnBasisPoints"])],
        submit=True,
    )
    return await fabric_transaction(
        "trust-manager", "completePenaltyDirective",
        [directive["directiveId"], json.dumps(execution, separators=(",", ":"), sort_keys=True)],
        submit=True,
    )


def require_penalty_executor(token: str | None) -> None:
    expected = settings().penalty_executor_token
    if not token or not secrets.compare_digest(token, expected):
        raise HTTPException(401, "Penalty executor authorization failed")


@app.post("/api/v2/internal/penalties/{directive_id}/execute")
async def execute_penalty_by_id(
    directive_id: str, x_penalty_executor_token: str | None = Header(default=None)
):
    require_penalty_executor(x_penalty_executor_token)
    directive = await fabric_transaction(
        "trust-manager", "getPenaltyDirective", [directive_id], submit=False
    )
    return await execute_penalty(directive)


@app.post("/api/v2/internal/penalties/reconcile")
async def reconcile_penalties(x_penalty_executor_token: str | None = Header(default=None)):
    require_penalty_executor(x_penalty_executor_token)
    directives = await fabric_transaction(
        "trust-manager", "getPendingPenaltyDirectives", [], submit=False
    )
    completed, failed = [], []
    for directive in directives:
        try:
            completed.append(await execute_penalty(directive))
        except RuntimeError as error:
            failed.append({"directiveId": directive["directiveId"], "error": str(error)})
    return {"completed": completed, "failed": failed}


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
        requested_domain=payload.requestedDomain,
        applicant_wallet=address,
        status="pending_governance",
    )
    session.add(application)
    await session.commit()
    return OrganizationApplicationResponse(
        applicationId=application_id,
        status=application.status,
    )


def require_governance(token: str | None) -> None:
    expected = settings().governance_token
    if not token or not secrets.compare_digest(token, expected):
        raise HTTPException(401, "Governance authorization failed")


def require_operations(token: str | None) -> None:
    expected = settings().operations_token
    if not token or not secrets.compare_digest(token, expected):
        raise HTTPException(401, "Operations authorization failed")


@app.get("/api/v2/internal/audit/events")
async def operational_audit_events(
    limit: int = Query(default=100, ge=1, le=1000),
    x_operations_token: str | None = Header(default=None),
):
    require_operations(x_operations_token)
    try:
        return await audit_events(limit)
    except RuntimeError as error:
        raise HTTPException(502, str(error)) from error


def organization_manifest(application: OrganizationApplication, reviewer_ids: list[str]) -> dict:
    return {
        "schemaVersion": "1",
        "applicationId": application.application_id,
        "governanceReference": application.governance_reference,
        "approvedAt": application.decided_at.isoformat() if application.decided_at else None,
        "legalIdentity": {
            "legalName": application.legal_name,
            "displayName": application.display_name,
            "jurisdiction": application.jurisdiction,
            "registrationNumber": application.registration_number,
        },
        "fabric": {
            "mspId": application.requested_msp_id,
            "domain": application.requested_domain,
            "peer": f"peer0.{application.requested_domain}",
            "ca": f"ca.{application.requested_domain}",
            "channels": {
                "credentials": settings().credential_channel_name,
                "trust": settings().trust_channel_name if application.join_trust_channel else None,
            },
            "roles": {
                "credentialIssuer": True,
                "trustGovernor": application.join_trust_channel,
            },
            "enrollment": {
                "reviewerIds": reviewer_ids,
            },
        },
    }


@app.get("/api/v2/internal/organizations/applications")
async def list_organization_applications(
    status: str | None = Query(default=None),
    x_governance_token: str | None = Header(default=None),
    session: AsyncSession = Depends(database_session),
):
    require_governance(x_governance_token)
    query = select(OrganizationApplication).order_by(OrganizationApplication.created_at)
    if status:
        query = query.where(OrganizationApplication.status == status)
    applications = (await session.execute(query)).scalars().all()
    return [{
        "applicationId": item.application_id,
        "legalName": item.legal_name,
        "displayName": item.display_name,
        "jurisdiction": item.jurisdiction,
        "registrationNumber": item.registration_number,
        "requestedMspId": item.requested_msp_id,
        "requestedDomain": item.requested_domain,
        "applicantWallet": item.applicant_wallet,
        "status": item.status,
        "createdAt": item.created_at,
        "decidedAt": item.decided_at,
        "decisionReason": item.decision_reason,
        "governanceReference": item.governance_reference,
    } for item in applications]


@app.post(
    "/api/v2/internal/organizations/applications/{application_id}/decision",
    response_model=OrganizationDecisionResponse,
)
async def decide_organization_application(
    application_id: str,
    payload: OrganizationDecisionRequest,
    x_governance_token: str | None = Header(default=None),
    session: AsyncSession = Depends(database_session),
):
    require_governance(x_governance_token)
    application = await session.get(OrganizationApplication, application_id)
    if not application:
        raise HTTPException(404, "Organization application does not exist")
    target_status = "approved_for_provisioning" if payload.decision == "approve" else "rejected"
    if payload.decision == "approve" and not payload.reviewerIds:
        raise HTTPException(422, "At least one reviewer identity is required for approval")
    if payload.decision == "approve" and application.requested_domain.endswith(".invalid"):
        raise HTTPException(422, "Migrated applications must be rejected and resubmitted with a routable Fabric domain")
    if application.status != "pending_governance":
        if application.status != target_status or application.governance_reference != payload.governanceReference:
            raise HTTPException(409, "Organization application already has a different decision")
        manifest = json.loads(application.provisioning_manifest) if application.provisioning_manifest else None
        return OrganizationDecisionResponse(
            applicationId=application.application_id,
            status=application.status,
            provisioningManifest=manifest,
        )
    application.status = target_status
    application.decided_at = datetime.now(UTC)
    application.decision_reason = payload.reason
    application.governance_reference = payload.governanceReference
    application.join_trust_channel = payload.joinTrustChannel if payload.decision == "approve" else False
    manifest = (
        organization_manifest(application, payload.reviewerIds)
        if payload.decision == "approve" else None
    )
    application.provisioning_manifest = (
        json.dumps(manifest, separators=(",", ":"), sort_keys=True) if manifest else None
    )
    await session.commit()
    return OrganizationDecisionResponse(
        applicationId=application.application_id,
        status=application.status,
        provisioningManifest=manifest,
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
