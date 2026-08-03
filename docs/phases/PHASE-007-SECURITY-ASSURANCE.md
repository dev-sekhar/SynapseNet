# Phase 7: Security and software-supply-chain assurance

## Delivered

- CodeQL analysis for JavaScript/TypeScript and Python.
- Pull-request dependency review that rejects high-severity dependency changes.
- Trivy filesystem and dependency scanning with high/critical failure policy.
- Gitleaks scanning across committed history and changes.
- A CycloneDX JSON software bill of materials retained as a workflow artifact.
- A fail-closed release gate requiring non-empty reports, valid SBOM structure, and no unresolved
  high or critical vulnerabilities.

Security findings must be fixed or formally risk-accepted outside the repository. The readiness
gate does not silently waive findings.
