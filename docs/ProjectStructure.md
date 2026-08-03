# Project Structure

SynapseNet is organized as a monorepo with explicit boundaries for client applications, deployable services, blockchain code, infrastructure automation, and documentation.

## Repository Map

Generated dependencies, compiled output, local databases, cryptographic material, and channel artifacts are omitted from this source-oriented tree.

```text
SynapseNet/
├── apps/                              # User-facing applications
│   ├── web/                           # React credential wallet
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── BusinessActions.tsx
│   │   │   ├── OrganizationOnboarding.tsx
│   │   │   ├── SharedCredentials.tsx
│   │   │   ├── TransactionScan.tsx
│   │   │   ├── TrustDisputes.tsx
│   │   │   ├── api.ts
│   │   │   ├── intents.ts
│   │   │   ├── main.tsx
│   │   │   ├── store.ts
│   │   │   ├── styles.css
│   │   │   └── theme.ts
│   │   ├── index.html
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── mobile/                        # Mobile client boundary (placeholder)
│       └── README.md
├── services/                          # Independently deployable backend services
│   ├── api-gateway/                   # Business API and direct Fabric gateway
│   │   ├── public/                    # Legacy static client
│   │   ├── src/
│   │   │   ├── auth-store.js
│   │   │   ├── http-errors.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── identity-api/                  # Wallet identity and organization API
│   │   ├── app/
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── domain.py
│   │   │   ├── fabric.py
│   │   │   ├── main.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   └── security.py
│   │   ├── migrations/                # Service-owned database schema
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── fabric-adapter/                # Narrow Fabric transaction adapter
│   │   ├── src/server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   └── skill-matcher/                 # Future AI matching service
│       ├── README.md
│       └── requirements.txt
├── blockchain/                        # Ledger code and Fabric definitions
│   ├── chaincode/
│   │   ├── skill-manager/
│   │   │   ├── META-INF/statedb/couchdb/indexes/
│   │   │   ├── src/                  # Five contracts, one credential-domain implementation
│   │   │   ├── test/
│   │   │   ├── Dockerfile
│   │   │   └── package.json
│   │   └── trust-manager/
│   │       ├── META-INF/statedb/couchdb/indexes/
│   │       ├── src/                  # Four contracts, one trust-domain implementation
│   │       ├── test/
│   │       ├── Dockerfile
│   │       └── package.json
│   ├── config/
│   │   ├── chaincode-versions.env
│   │   └── trust-policy.dev.json
│   ├── consortium/                    # Governed organization manifests and schema
│   │   ├── approved/                  # Approved manifests drive production rendering
│   │   ├── examples/                  # Non-production examples
│   │   └── organization-manifest.schema.json
│   └── network/
│       ├── configtx.yaml
│       ├── core.yaml
│       ├── crypto-config.yaml
│       ├── generated/                 # Ignored rendered consortium topology
│       └── docker-compose.yaml
├── infrastructure/                    # Repeatable operational automation
│   └── scripts/
│       ├── auth-admin.js
│       ├── common.sh
│       ├── create-channel.sh
│       ├── create-domain-channels.sh
│       ├── deploy-chaincode.sh
│       ├── deploy-trust-chaincode.sh
│       ├── deploy-consortium-chaincodes.sh
│       ├── backup-application-data.sh
│       ├── enroll-actor-identity.sh
│       ├── enroll-consortium-organization.sh
│       ├── generate-network.sh
│       ├── governance-organization.sh
│       ├── initialize-trust-policy.sh
│       ├── initialize-wallets.sh
│       ├── list-users.sh
│       ├── network-down.sh
│       ├── network-reset.sh
│       ├── network-up.sh
│       ├── production-readiness.sh
│       ├── phase5-monitoring.sh
│       ├── phase5-readiness.sh
│       ├── join-consortium-peers.sh
│       ├── render-consortium-config.py
│       ├── restore-drill.sh
│       ├── validate-phase5-observability.sh
│       ├── validate-channel-isolation.sh
│       ├── validate-generated-topology.sh
│       └── smoke-test.sh
├── docs/                              # Product and engineering documentation
│   ├── adr/
│   ├── phases/
│   ├── sprints/
│   ├── ARCHITECTURE.md
│   ├── CHAINCODE_API.md
│   ├── DOMAIN_MODEL.md
│   ├── DISASTER_RECOVERY.md
│   ├── INCIDENT_RESPONSE.md
│   ├── PRD.md
│   ├── ROADMAP.md
│   ├── ProjectStructure.md
│   ├── RUNNING.md
│   ├── SMART_CONTRACT_ENGINEERING.md
│   ├── WORKING.md
│   └── chaincode.md
├── reports/                           # Checked-in test and sprint summaries
├── infrastructure/monitoring/         # Prometheus and Alertmanager configuration
├── infrastructure/performance/        # Read-only k6 capacity scenarios
├── .github/workflows/                 # Continuous integration
├── docker-compose.yml                 # Local full-stack orchestration
├── docker-compose.monitoring.yml      # Internal production monitoring overlay
├── package.json                       # JavaScript workspace commands
└── yarn.lock
```

## Layer Ownership

| Layer | Paths | Owns |
|---|---|---|
| Frontend | `apps/web`, `apps/mobile` | User interfaces, browser state, wallet prompts, and client-side API bindings. |
| Backend | `services/api-gateway`, `services/identity-api` | Authentication, HTTP APIs, validation, persistence, and use-case orchestration. |
| Database | `services/identity-api/app/models.py`, `services/identity-api/migrations` | Relational models and schema migrations owned exclusively by the identity API. |
| Blockchain integration | `services/fabric-adapter` | Fabric peer connectivity and transaction submission/evaluation for the identity API. |
| Smart contracts | `blockchain/chaincode` | Deterministic credential and trust ledger rules. |
| Blockchain network | `blockchain/network`, `blockchain/config`, `blockchain/consortium` | Fabric topology, governed membership, channel configuration, lifecycle versions, and trust policy defaults. |
| Infrastructure | `infrastructure/scripts`, `docker-compose.yml`, `.github/workflows` | Local operations, deployment automation, containers, and CI. |

The database is intentionally not a top-level directory. It is private to `identity-api`, so keeping models and migrations with that service makes schema ownership explicit and prevents other services from coupling directly to its tables.

## Runtime Request Flow

```text
                            Browser wallet
                                  │
                  ┌───────────────┴────────────────┐
                  ▼                                ▼
          services/api-gateway           services/identity-api
          (business login and             (credentials, wallets,
           registration)                   sharing, trust, penalties)
                  │                         │
                  │                         ▼
                  │              services/fabric-adapter
                  │                         │
                  └──────────────┬──────────┘
                                 ▼
                         Hyperledger Fabric
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
               skill-manager             trust-manager
```

The two API services own authentication and response shaping. The Fabric adapter isolates peer connectivity for the identity API. Chaincode is the source of truth for ledger-backed credential and trust state.

## Placement Rules

- Put browser UI, client state, and browser API wrappers in `apps/web/src`.
- Put business-session endpoints and legacy API orchestration in `services/api-gateway/src`.
- Put wallet identity, relational persistence, and organization workflows in `services/identity-api/app`.
- Put identity database migrations in `services/identity-api/migrations/versions`.
- Put reusable Fabric transport behavior in `services/fabric-adapter`.
- Put deterministic ledger rules in the appropriate contract under `blockchain/chaincode`.
- Put audited chaincode versions and policy defaults in `blockchain/config`.
- Put repeatable operator workflows in `infrastructure/scripts`.
- Record architectural decisions in `docs/adr` and contract changes in `docs/chaincode.md`.

## Generated and Local-Only Paths

These paths may exist in a checkout but are not part of the logical source tree:

- `node_modules`, Python virtual environments, `dist`, TypeScript build metadata, and test caches.
- `.env` files and service-local authentication or database data.
- `blockchain/network/crypto-config` generated certificates and private keys.
- `blockchain/network/channel-artifacts` generated blocks, transactions, and chaincode archives.

Generated and local-only paths must remain ignored and must not become source-of-truth configuration.
