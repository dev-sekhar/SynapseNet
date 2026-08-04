# Company Network

## Phase 1: Follow companies

Phase 1 gives an authenticated individual a visual network of registered SynapseNet companies.
The individual is the center node, and organizations are surrounding nodes rendered with their
configured logo or an initials fallback. Selecting **Follow** creates a connection; selecting
**Following** removes it.

### Data ownership

- Fabric `IdentityContract.getEnterprises` is the authoritative company directory. An arbitrary
  or unregistered enterprise cannot be followed.
- The identity API owns the off-chain `company_follows` relationship. This avoids ledger writes
  for private, high-volume social preferences.
- The identity API owns optional company presentation metadata in `company_profiles`. A reviewer
  may update only the profile belonging to their Fabric-resolved enterprise.
- No wallet address is stored in a follow edge. The edge uses the provisioned actor identifier.

### API

| Method | Route | Actor | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v2/network/companies` | Individual | Return the center identity, verified companies, follow state, logo, and counts. |
| `POST` | `/api/v2/network/companies/{enterpriseId}/follow` | Individual | Idempotently follow a registered company. |
| `DELETE` | `/api/v2/network/companies/{enterpriseId}/follow` | Individual | Idempotently remove a follow. |
| `PUT` | `/api/v2/network/companies/{enterpriseId}/profile` | Company reviewer | Set or clear the company's HTTPS logo URL. |

The graph refreshes every 30 seconds and immediately refreshes after a follow change. Followed
connections use a solid accent line; other available companies use a dashed neutral line.

### Manual verification

1. Apply migration `0006`, start the platform, and connect a wallet provisioned to an individual.
2. Find **Companies you follow** below the wallet and latest-transaction cards.
3. Confirm the signed-in individual is the center node and each Fabric enterprise is a company node.
4. Follow a company and confirm its button, connection line, and following count update.
5. Reload the page and confirm the relationship persists; select **Following** to remove it.
6. Sign in as a reviewer and confirm the individual network is not shown.
