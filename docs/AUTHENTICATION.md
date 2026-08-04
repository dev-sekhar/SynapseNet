# Wallet authentication

## Normal access

SynapseNet uses a provisioned MetaMask wallet as the user-facing login. The public landing page
contains **Connect Wallet** in the navbar and hero; it has no Login ID, password form, or separate
secure-access section.

1. The user chooses a MetaMask account.
2. `POST /api/v2/auth/wallet/challenge` creates a short-lived, single-use challenge.
3. MetaMask signs the exact challenge with `personal_sign`.
4. `POST /api/v2/auth/wallet/verify` recovers the address and creates the wallet session.
5. `GET /api/v2/auth/wallet/actor` resolves the immutable wallet-to-actor mapping.
6. The root URL reloads as the authenticated React application; no `/app` path or second business
   login is used.

One wallet address represents one SynapseNet actor. Role, enterprise assignment, and Fabric
identity come from the provisioned mapping, not from browser-supplied claims. An unlinked wallet is
denied dashboard access and must be provisioned through the governed identity workflow.

Credential submissions use the actor's MSP binding from the Fabric identity record. For actors
created before MSP-aware chaincode was deployed, the API uses the governed `WalletIdentity`
provisioning record as the compatibility source. If neither source contains an MSP, submission is
denied rather than falling back to a browser-provided organization.

## Logout and account switching

Logout calls both wallet-session and compatibility-session logout endpoints, clears browser wallet
state, requests `wallet_revokePermissions` for `eth_accounts`, and returns to `/`. Providers that
do not implement permission revocation still have their SynapseNet state cleared. The next
**Connect Wallet** uses `wallet_requestPermissions`, allowing the user to choose an account.

## Compatibility boundary

Legacy password and reset endpoints remain only for controlled migration or administrative
recovery. They are not shown on the landing page and are disabled as an authorization fallback
when `ALLOW_LEGACY_BUSINESS_SESSIONS=false`. Production also sets
`REQUIRE_WALLET_FOR_CREDENTIALS=true` and `REQUIRE_CALLER_IDENTITY=true`.

## Live transactions

The transaction API resolves its actor from the verified wallet session. It filters the durable
Fabric projection to that holder or reviewer organization, and the browser polls every five
seconds. A temporary adapter interruption clears automatically after both event indexes recover.
An expired wallet session stops polling after the first `401` and prompts the user to reconnect,
preventing an unauthorized retry loop.
