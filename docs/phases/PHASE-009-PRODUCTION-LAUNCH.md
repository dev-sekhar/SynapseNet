# Phase 9: Production launch and roadmap closure

## Delivered

- A final certificate bound to the exact clean Git commit and immutable release ID.
- Mandatory evidence from Phases 4 through 8, each retained with a SHA-256 digest.
- Independent approvals from consortium governance, security, operations, and release authority.
- Rejection of missing phases, incomplete approvals, mismatched commits, duplicate evidence,
  empty artifacts, and dirty working trees.

## Finalization

Create an approval document containing `releaseId`, `commit`, and an `approvals` object with
`governance`, `security`, `operations`, and `releaseAuthority`. Each approval contains
`approved: true`, `name`, and `approvedAt`.

```bash
yarn phase9:finalize --release-id "$RELEASE_ID" \
  --approvals /secure/release-evidence/approvals.json \
  --output /secure/release-evidence/go-live-certificate.json \
  --evidence phase4=/secure/release-evidence/phase4-readiness.txt \
  --evidence phase5=/secure/release-evidence/phase5-readiness.txt \
  --evidence phase6=/secure/release-evidence/phase6-release-evidence.json \
  --evidence phase7=/secure/release-evidence/phase7-security.txt \
  --evidence phase8=/secure/release-evidence/phase8-continuity.txt
```

The certificate authorizes launch; it does not deploy infrastructure or fabricate human approval.
