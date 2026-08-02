# SynapseNet

SynapseNet is a Hyperledger Fabric–backed network for enterprise-verified
professional credentials. Users submit structured skill, role, education, or
certificate claims to an enterprise. An authorized enterprise reviewer validates
the evidence, and approved credentials enter the user's portable skill wallet.

Users control disclosure. A wallet owner selects individual credentials and
creates a recipient-, purpose-, and time-bound QR share. The named recipient
must sign in before the QR view reveals only those selected credentials.

## Business flow

1. **Onboard participants.** A user registers, and an enterprise registers with
   an initial reviewer. These events are recorded on the ledger. Each participant
   then signs in to a role-specific workspace.
2. **Submit a claim.** The user chooses a validating enterprise and submits a
   structured `skill`, `role`, `education`, `certificate`, or `other` claim.
3. **Attach evidence integrity proofs.** Resumes, certificates, employment
   letters, and similar documents remain in Google Drive or another off-chain
   store. SynapseNet records their SHA-256 hashes and storage references.
4. **Enterprise validation.** A reviewer registered to the selected enterprise
   approves or rejects the claim. For example, IIT Madras can validate an
   education credential, while an Amazon reviewer can validate an Amazon role.
5. **Wallet issuance.** Approval creates an immutable credential issued by that
   enterprise, adds it to the user's approved-credential wallet, and records it
   in the issuing enterprise's credential wallet.
6. **Selective sharing.** The owner chooses one or more credentials, recipient,
   purpose, start time, and expiry time. SynapseNet records the grant and
   generates a QR code for its restricted view. The QR is a pointer, not a
   substitute for recipient authentication.

## Accounts and application roles

The local web application supports two account types:

- **User:** submits claims for their own identity, views their wallet, and creates
  selective shares.
- **Enterprise reviewer:** sees only requests assigned to their enterprise and
  can approve or reject them.

Passwords are never written to Fabric. The development gateway derives password
hashes with Node.js `scrypt` and stores them in the ignored local file
`services/api-gateway/data/auth.json`. Browser sessions use HTTP-only, same-site
cookies. Set a stable `SESSION_SECRET` environment variable outside local
development.

Ledger registrations created before login support was added do not have an
off-ledger password record. An administrator can issue a one-time activation or
reset token:

```bash
yarn users:list
yarn auth:issue-reset user-a
```

The token is valid for 30 minutes and can be used once in the application's
“Activate an existing ledger login or reset a password” form. The same flow
resets passwords for configured accounts. Share the token through a secure
channel; never place it on the ledger or in source control.

For local development, the reset form also provides a **Get one-time token**
button. Enter the login ID, request the token, and the application fills it in
automatically. This shortcut is disabled when `NODE_ENV=production`. Production
must deliver reset tokens through a previously verified email address, phone
number, or external identity provider; it must never return them in an API
response.

## Error handling and operational safety

The gateway uses established Node.js middleware and wire standards:

- **Zod** validates API bodies, parameters, evidence hashes, and dates.
- **RFC Problem Details** (`application/problem+json`) provides consistent
  status, title, detail, field errors, request instance, and trace ID values.
- **Pino HTTP** emits structured request logs and redacts passwords, reset
  tokens, cookies, and `Set-Cookie` headers.
- **Helmet** applies browser security headers and a restrictive content security
  policy.
- **express-rate-limit** protects login and password-reset endpoints.
- **Axios** centralizes browser requests, converts Problem Details into typed
  errors, and feeds an accessible application error panel.

Unhandled browser errors and promise rejections are surfaced through the same
panel. Expected client errors are logged as warnings; unexpected server failures
are logged as errors with matching trace IDs.

Claim entry uses dedicated forms instead of JSON:

- Skills: proficiency, experience, last-used date, and application
- Roles: organization, job title, team, employment type, dates, and achievements
- Education: institution, program, field, dates, and grade
- Certificates: issuer, certificate number, issue/expiry dates, and URL
- Other credentials: category, date, and description

## Privacy and evidence

SynapseNet hashes the actual file bytes—not a Google Drive URL. The browser can
calculate SHA-256 locally, and the document itself is never uploaded by this
MVP. Do not put document contents, OAuth tokens, public Drive links, or sensitive
personal information on the ledger.

The current MVP stores the supplied storage reference on-chain for demonstration.
A production deployment should store an opaque encrypted reference off-chain and
commit only its hash. Enterprise reviewers should receive temporary document
access, download the evidence, recompute SHA-256, and compare it with the
on-ledger value before approving.

## Ledger records and events

The Skill Manager chaincode maintains:

- Users and enterprises
- Enterprise reviewer membership
- Structured credential requests and evidence hashes
- Approval and rejection decisions
- Issued wallet credentials
- User credential wallets and enterprise-issued credential wallets
- Dummy SynapseNet token balances for users and enterprises
- Selective, expiring, revocable share grants

It emits auditable events including:

```text
UserRegistered
EnterpriseRegistered
EnterpriseMemberAdded
CredentialRequested
CredentialApproved
CredentialRejected
CredentialAddedToWallet
ShareGrantCreated
ShareGrantRevoked
WalletOpened
DummyTokensAllocated
CredentialAddedToEnterpriseWallet
```

## Credential and token wallets

Every newly registered user and enterprise receives a ledger-backed wallet.
Existing participants receive one idempotently when they next open their wallet
view.

- A **user wallet** lists approved credentials owned by that user.
- An **enterprise wallet** lists credentials approved and issued by that
  enterprise.
- Both wallet types currently receive **1,000 SNT** as a dummy development
  allocation.

After sign-in, the credential and token wallets appear as side-by-side summary
cards near the top of the dashboard, above the structured evidence form. The
credential card shows approved, pending, rejected, and total counts. Select the
card to inspect the corresponding credential records and their evidence
metadata. The token card shows issued, used, burnt, and available SNT. Select it
to inspect the complete token transaction journal.

Wallet contents are derived from the signed-in ledger identity; a user cannot
request another user's wallet by changing a browser parameter. Existing wallet
records are also backfilled with approved credential links when opened.

`SNT` has no monetary value, cannot currently be purchased or transferred, and
must not be represented as a real cryptocurrency. Token economics, supply
controls, transfers, and regulatory treatment are intentionally outside this
MVP.

To initialize or backfill wallets for every existing ledger participant:

```bash
yarn wallets:initialize
```

The command is idempotent. Running it again preserves wallet IDs, credential
links, balances, and token transactions.

Every record also includes the submitting Fabric certificate identity. The web
gateway currently uses one Org1 administrator certificate underneath
session-authorized logical user and reviewer accounts. Production deployments
should replace the local password store and shared gateway identity with an
identity provider plus separately enrolled Fabric identities or enterprise MSPs.

## Run the MVP

Prerequisites and detailed troubleshooting are in
[docs/RUNNING.md](docs/RUNNING.md).

For a clean first run:

```bash
yarn install
yarn network:generate
yarn network:up
yarn network:create-channel
yarn network:deploy
yarn ui:start
```

Open <http://localhost:3001>. The root URL serves the public landing page while
signed out and the React 19 Web3 client after sign-in; there is no separate
`/app` entry point. Credential, wallet, and sharing operations use FastAPI; Express remains
only for password-backed business login and initial registration.

The gateway listens on `0.0.0.0` by default so the Dockerized application API
can reach it through `host.docker.internal`. Set `HOST=127.0.0.1` when the
gateway does not need to be reached from a container.

### Application API

The React 19 wallet client uses the FastAPI application boundary for credentials, wallets,
sharing, trust, and transaction history:

```bash
python3 -m venv services/identity-api/.venv
services/identity-api/.venv/bin/pip install -r services/identity-api/requirements.txt
cp services/identity-api/.env.example services/identity-api/.env
# Replace both secrets in services/identity-api/.env before starting.
cd services/identity-api
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
yarn web3:dev
```

Open <http://localhost:3002>. MetaMask signs a short-lived authentication
challenge; SynapseNet never receives the wallet private key.

Alternatively, run the Python 3.13 API in Docker:

```bash
docker-compose --profile web3 up -d application-api
```

The API applies its SQLite migrations at startup and listens on port 8000.
Project documents are available at <http://localhost:8000/docs>, Swagger at
<http://localhost:8000/api/docs>, and ReDoc at
<http://localhost:8000/api/redoc>. All three documentation views use the same
SynapseNet navigation and visual theme.

### Trust manager

The separate trust-manager chaincode owns wallet bindings, replay-resistant
signed intents, non-transferable REP, misconduct incidents, and progressive
penalty directives:

```bash
yarn trust:test
yarn trust:deploy
yarn trust:initialize
```

Development penalty and reputation settings are versioned in
`blockchain/config/trust-policy.dev.json`. Production consortium policy must replace the
development `Org1MSP` entry with exact legal-entity MSP identifiers.

After changing an already deployed chaincode definition, increment its sequence:

```bash
CHAINCODE_SEQUENCE=2 CHAINCODE_VERSION=1.1 yarn network:deploy
```

Run the chaincode tests with:

```bash
yarn chaincode:test
```

## MVP walkthrough

1. Register `user-a` with a password, then sign in.
2. Register `iit-madras` with reviewer `reviewer-iitm` and a separate password.
3. As User A, submit a skill or education claim, select IIT Madras, and attach
   a SHA-256 evidence hash.
4. Sign out, sign in as `reviewer-iitm`, and approve the request.
5. Sign in as User A and select only the wallet credentials to disclose.
6. Enter a registered recipient ID, purpose, validity period, and expiry.
7. The named recipient signs in and opens the QR share to see its restricted
   wallet view.

Share identity, time, and revocation authorization are enforced whenever the QR
URL is opened. Other users and expired or revoked grants receive no credential
data.
