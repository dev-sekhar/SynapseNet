# Comprehensive testing

SynapseNet has one comprehensive, non-destructive test command:

```bash
yarn test:comprehensive
```

It validates the frontend production build, identity API and migrations, both chaincodes,
infrastructure and release controls, Docker Compose, all shell automation, the three-orderer
Fabric topology, Prometheus/Alertmanager configuration, and the k6 capacity scenario. Every check
runs even if an earlier check fails, and the command exits non-zero if any check fails.

To include the already-running application and its ledger-backed health endpoints:

```bash
yarn test:comprehensive:running
```

The running mode additionally checks container health, the application ledger health endpoint,
all three documentation surfaces, and both Fabric event streams. Start the network and application
before using it:

```bash
yarn network:up
yarn network:create-channel
yarn network:deploy
yarn ui:start
```

The complete result is stored in `reports/comprehensive-test.log`. Override the location with
`COMPREHENSIVE_TEST_REPORT=/secure/path/test.log` when retaining release evidence.

The unified test intentionally does not stop orderers, mutate production credentials, approve
organizations, rotate secrets, or manufacture governance evidence. Controlled resilience,
disaster-recovery, security-report, and final approval gates require real production inputs and
remain separate authorized operations.
