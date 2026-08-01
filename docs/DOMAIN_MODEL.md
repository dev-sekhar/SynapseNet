# Domain Model

## Credential

A credential has one holder and one authoritative issuer. Other organizations
may verify its signature, issuer, evidence hash, and ledger status, but may not
change its validity.

Statuses:

`pending_validation`, `active`, `challenged`, `issuer_unresponsive`,
`suspended`, `revoked`, `invalidated`.

### Skill credential details

A `skill` request uses its title as the mandatory skill name and references one mandatory
authoritative enterprise. Its structured `details` contain:

- `proficiencyLevel`: `Beginner`, `Intermediate`, `Advanced`, or `Expert` (required)
- `yearsExperience`: number from 0 through 80 (optional)
- `practicalApplication`: business context, projects, outcomes, and impact (required)
- `tools`: up to 30 associated tools or frameworks (optional)
- `lastUsed`: `YYYY-MM`, or an empty value when currently used (optional)
- `attestations`: up to 20 peer/manager emails or handles (optional)

At least one evidence item is mandatory. Allowed skill evidence categories are Assessment
Score, Code Repository, Work Deliverable, Certificate, Performance Review, and Other. The
file remains outside Fabric; the ledger stores its name, SHA-256 proof, storage provider,
and optional encrypted storage reference.

## Wallet authorization

`WalletIdentity` binds a normalized MetaMask address to a logical actor and,
where applicable, a Fabric MSP. Authentication challenges are single-use,
short-lived, and retained only as hashes/operational records.

## Reputation

REP is non-transferable, non-purchasable, and unsuitable for payment. It is
derived from immutable performance and misconduct events. SNT remains the
transferable utility and compliance-staking token.

## Misconduct incident

Lifecycle:

`reported → investigating → confirmed/dismissed → appealed → final`

Only a final confirmed incident advances the progressive counter. Penalties
burn the participant's locked compliance stake:

1. 10% on the first incident.
2. 25% on the second incident.
3. 100% on the third and later incidents, followed by suspension.

All rates, thresholds, response periods, rewards, and governance requirements
are versioned policy records.
