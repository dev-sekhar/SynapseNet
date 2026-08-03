const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const express = require('express');
const helmet = require('helmet');
const { z } = require('zod');

const PORT = Number(process.env.PORT || 3010);
const TOKEN = process.env.FABRIC_ADAPTER_TOKEN;
if (!TOKEN || TOKEN.length < 32) throw new Error('FABRIC_ADAPTER_TOKEN must contain at least 32 characters');

const cryptoRoot = process.env.FABRIC_CRYPTO_ROOT || path.resolve(
    __dirname, '../../../blockchain/network/crypto-config'
);
const mspPath = path.join(
    cryptoRoot, 'peerOrganizations/org1.synapsenet.com/users/Admin@org1.synapsenet.com/msp'
);
const first = (directory) => path.join(directory, fs.readdirSync(directory)[0]);
const credentials = fs.readFileSync(first(path.join(mspPath, 'signcerts')));
const privateKey = crypto.createPrivateKey(fs.readFileSync(first(path.join(mspPath, 'keystore'))));
const tlsRootCert = fs.readFileSync(path.join(
    cryptoRoot,
    'peerOrganizations/org1.synapsenet.com/peers/peer0.org1.synapsenet.com/tls/ca.crt'
));
const client = new grpc.Client(
    process.env.PEER_ENDPOINT || 'peer0.org1.synapsenet.com:7051',
    grpc.credentials.createSsl(tlsRootCert),
    { 'grpc.ssl_target_name_override': 'peer0.org1.synapsenet.com' }
);
const gateway = connect({
    client,
    identity: { mspId: process.env.FABRIC_MSP_ID || 'Org1MSP', credentials },
    signer: signers.newPrivateKeySigner(privateKey),
    hash: hash.sha256
});
const skillNetwork = gateway.getNetwork(
    process.env.SKILL_CHANNEL_NAME || process.env.CHANNEL_NAME || 'synapsenet'
);
const trustNetwork = gateway.getNetwork(
    process.env.TRUST_CHANNEL_NAME || process.env.CHANNEL_NAME || 'synapsenet'
);
const networks = new Map([
    ['skill-manager', skillNetwork],
    ['trust-manager', trustNetwork]
]);
const allowed = new Map([
    ['trust-manager', new Set([
        'registerParticipant', 'reportIncident', 'appealIncident', 'getParticipant',
        'getIncident', 'getActivePolicy', 'getCredentialTrustStatus',
        'getPenaltyDirective', 'getPendingPenaltyDirectives', 'completePenaltyDirective'
    ])],
    ['skill-manager', new Set([
        'getUsers', 'getEnterprises', 'submitCredentialRequest', 'reviewCredentialRequest',
        'getWalletAccount', 'getWallet', 'getIssuedCredentials', 'getCredentialRequests',
        'getTokenTransactions', 'openWallet', 'createShareGrant', 'revokeShareGrant',
        'getShareGrant', 'getSharedCredentials', 'executePenaltyDirective'
    ])]
]);
const smartContracts = new Map([
    ['trust-manager', new Map([
        ...['getActivePolicy'].map((transaction) => [transaction, 'SynapseNet.TrustPolicyContract']),
        ...['registerParticipant', 'getParticipant']
            .map((transaction) => [transaction, 'SynapseNet.ParticipantTrustContract']),
        ...['reportIncident', 'appealIncident', 'getIncident', 'getCredentialTrustStatus']
            .map((transaction) => [transaction, 'SynapseNet.IncidentContract']),
        ...['getPenaltyDirective', 'getPendingPenaltyDirectives', 'completePenaltyDirective']
            .map((transaction) => [transaction, 'SynapseNet.ReputationContract'])
    ])],
    ['skill-manager', new Map([
        ...['getUsers', 'getEnterprises']
            .map((transaction) => [transaction, 'SynapseNet.IdentityContract']),
        ...['getWallet', 'getIssuedCredentials', 'getCredentialRequests']
            .map((transaction) => [transaction, 'SynapseNet.CredentialContract']),
        ...['submitCredentialRequest', 'reviewCredentialRequest']
            .map((transaction) => [transaction, 'SynapseNet.CredentialContract']),
        ...['getWalletAccount', 'getTokenTransactions', 'openWallet']
            .map((transaction) => [transaction, 'SynapseNet.WalletContract']),
        ['executePenaltyDirective', 'SynapseNet.TokenContract'],
        ...['createShareGrant', 'revokeShareGrant', 'getShareGrant', 'getSharedCredentials']
            .map((transaction) => [transaction, 'SynapseNet.SharingContract'])
    ])]
]);
const schema = z.object({
    contract: z.string(),
    transaction: z.string(),
    args: z.array(z.string()).max(12),
    submit: z.boolean(),
    identity: z.object({
        mspId: z.string().regex(/^[A-Za-z][A-Za-z0-9]{2,63}MSP$/),
        enrollmentId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/),
        role: z.enum(['user', 'reviewer'])
    }).nullable().optional()
});
const identityGateways = new Map();
const requireCallerIdentity = process.env.REQUIRE_CALLER_IDENTITY === 'true';
const mspDomains = JSON.parse(process.env.FABRIC_MSP_DOMAINS_JSON || '{"Org1MSP":"org1.synapsenet.com"}');

function callerContract(command) {
    if (!command.identity) {
        if (requireCallerIdentity && command.submit) throw new Error('A caller Fabric identity is required');
        return networks.get(command.contract).getContract(
            command.contract, smartContracts.get(command.contract)?.get(command.transaction)
        );
    }
    const key = `${command.identity.mspId}:${command.identity.enrollmentId}`;
    if (!identityGateways.has(key)) {
        const domain = mspDomains[command.identity.mspId];
        if (!domain) throw new Error(`No Fabric domain is configured for ${command.identity.mspId}`);
        const callerMsp = path.join(
            cryptoRoot, `peerOrganizations/${domain}/users/${command.identity.enrollmentId}@${domain}/msp`
        );
        if (!fs.existsSync(callerMsp)) {
            if (requireCallerIdentity) throw new Error(`Fabric identity ${key} is not enrolled`);
            return networks.get(command.contract).getContract(
                command.contract, smartContracts.get(command.contract)?.get(command.transaction)
            );
        }
        const callerCredentials = fs.readFileSync(first(path.join(callerMsp, 'signcerts')));
        const callerKey = crypto.createPrivateKey(fs.readFileSync(first(path.join(callerMsp, 'keystore'))));
        const callerGateway = connect({
            client,
            identity: { mspId: command.identity.mspId, credentials: callerCredentials },
            signer: signers.newPrivateKeySigner(callerKey),
            hash: hash.sha256
        });
        identityGateways.set(key, callerGateway);
    }
    const callerGateway = identityGateways.get(key);
    const network = callerGateway.getNetwork(
        command.contract === 'skill-manager'
            ? (process.env.SKILL_CHANNEL_NAME || process.env.CHANNEL_NAME || 'synapsenet')
            : (process.env.TRUST_CHANNEL_NAME || process.env.CHANNEL_NAME || 'synapsenet')
    );
    return network.getContract(
        command.contract, smartContracts.get(command.contract)?.get(command.transaction)
    );
}
const credentialTransactions = new Map();
const auditEvents = new Map();
const auditStorePath = process.env.AUDIT_STORE_PATH || '/var/lib/synapsenet-audit/events.jsonl';
let eventStreamError = null;
let eventStreamReady = false;
let blockStreamReady = false;
let blockStreamError = null;

function persistAudit(item) {
    if (auditEvents.has(item.auditId)) return;
    fs.mkdirSync(path.dirname(auditStorePath), { recursive: true });
    fs.appendFileSync(auditStorePath, `${JSON.stringify(item)}\n`, { mode: 0o600 });
    auditEvents.set(item.auditId, item);
}

function loadAuditStore() {
    if (!fs.existsSync(auditStorePath)) return;
    for (const line of fs.readFileSync(auditStorePath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
            const item = JSON.parse(line);
            if (item.auditId) auditEvents.set(item.auditId, item);
            if (item.kind === 'credential' && item.transactionHash) {
                credentialTransactions.set(item.transactionHash, item.projection);
            }
        } catch (error) {
            blockStreamError = `Audit store contains an invalid record: ${error.message}`;
        }
    }
}
loadAuditStore();

async function credentialRequestReferences() {
    const result = await skillNetwork.getContract(
        'skill-manager', 'SynapseNet.CredentialContract'
    )
        .evaluateTransaction('getCredentialRequests');
    const requests = JSON.parse(Buffer.from(result).toString('utf8'));
    return new Map(requests.map((request) => [request.requestId, request]));
}

function legacyCredentialTransaction(event, payload, references) {
    let requestId = payload.requestId;
    let action = 'submit';
    if (event.eventName === 'CredentialAddedToEnterpriseWallet') {
        requestId = String(payload.credentialId || '').replace(/^credential-/, '');
        action = 'review';
    } else if (event.eventName === 'CredentialRejected') {
        action = 'review';
    } else if (event.eventName !== 'CredentialRequested') {
        return null;
    }
    const request = references.get(requestId);
    if (!request) return null;
    return {
        action,
        requestId,
        credentialId: action === 'review' && request.status === 'approved'
            ? `credential-${requestId}` : null,
        userId: request.userId,
        enterpriseId: request.enterpriseId,
        reviewerId: action === 'review' ? request.reviewedBy : undefined,
        credentialType: request.credentialType,
        title: request.title,
        status: action === 'submit' ? 'pending_validation' : request.status,
        timestamp: action === 'submit' ? request.createdAt : request.reviewedAt
    };
}

async function indexCredentialTransactions() {
    let events;
    try {
        const references = await credentialRequestReferences();
        events = await skillNetwork.getChaincodeEvents('skill-manager', {
            startBlock: BigInt(process.env.TRANSACTION_INDEX_START_BLOCK || '0')
        });
        eventStreamReady = true;
        for await (const event of events) {
            try {
                const payload = JSON.parse(Buffer.from(event.payload).toString('utf8'));
                const transaction = event.eventName === 'CredentialTransaction'
                    ? payload
                    : legacyCredentialTransaction(event, payload, references);
                if (!transaction) continue;
                const projection = {
                    transactionHash: event.transactionId,
                    blockNumber: event.blockNumber.toString(),
                    validationStatus: 'VALID',
                    ...transaction
                };
                credentialTransactions.set(event.transactionId, projection);
                persistAudit({
                    auditId: `credential:${event.transactionId}`,
                    kind: 'credential',
                    channel: process.env.SKILL_CHANNEL_NAME || process.env.CHANNEL_NAME || 'synapsenet',
                    transactionHash: event.transactionId,
                    blockNumber: event.blockNumber.toString(),
                    validationStatus: 'VALID',
                    recordedAt: new Date().toISOString(),
                    projection
                });
                eventStreamError = null;
            } catch (error) {
                eventStreamError = `Invalid CredentialTransaction event: ${error.message}`;
            }
        }
    } catch (error) {
        eventStreamReady = false;
        eventStreamError = error.message;
        setTimeout(() => void indexCredentialTransactions(), 2_000);
    } finally {
        events?.close();
    }
}

async function indexValidationEvents() {
    let events;
    try {
        events = await skillNetwork.getFilteredBlockEvents({
            startBlock: BigInt(process.env.AUDIT_INDEX_START_BLOCK || '0')
        });
        blockStreamReady = true;
        for await (const block of events) {
            const blockNumber = String(block.number ?? block.blockNumber ?? '0');
            for (const transaction of block.filteredTransactions || []) {
                const code = Number(transaction.txValidationCode ?? 0);
                if (code === 0) continue;
                const transactionId = transaction.txid || transaction.transactionId;
                if (!transactionId) continue;
                persistAudit({
                    auditId: `invalid:${transactionId}`,
                    kind: 'invalid-transaction',
                    channel: process.env.SKILL_CHANNEL_NAME || process.env.CHANNEL_NAME || 'synapsenet',
                    transactionHash: transactionId,
                    blockNumber,
                    validationStatus: String(code),
                    recordedAt: new Date().toISOString()
                });
            }
            blockStreamError = null;
        }
    } catch (error) {
        blockStreamReady = false;
        blockStreamError = error.message;
        setTimeout(() => void indexValidationEvents(), 2_000);
    } finally {
        events?.close();
    }
}
const app = express();
app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use((request, response, next) => {
    const supplied = Buffer.from(request.headers.authorization?.replace(/^Bearer /, '') || '');
    const expected = Buffer.from(TOKEN);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return response.status(401).json({ detail: 'Internal adapter authorization failed' });
    }
    next();
});
app.post('/v1/transactions', async (request, response) => {
    try {
        const command = schema.parse(request.body);
        if (!allowed.get(command.contract)?.has(command.transaction)) {
            return response.status(403).json({ detail: 'Contract transaction is not allow-listed' });
        }
        const smartContract = smartContracts.get(command.contract)?.get(command.transaction);
        if (!smartContract) {
            return response.status(403).json({ detail: 'Smart contract route is not configured' });
        }
        const contract = callerContract(command);
        const result = command.submit
            ? await contract.submitTransaction(command.transaction, ...command.args)
            : await contract.evaluateTransaction(command.transaction, ...command.args);
        const text = Buffer.from(result).toString();
        try { response.json({ result: text ? JSON.parse(text) : null }); }
        catch { response.json({ result: text }); }
    } catch (error) {
        response.status(400).json({ detail: error.message });
    }
});
app.get('/v1/ledger/credential-transactions', (_request, response) => {
    response.json({
        items: [...credentialTransactions.values()],
        indexing: { ready: eventStreamReady, error: eventStreamError }
    });
});
app.get('/v1/audit/events', (request, response) => {
    const limit = Math.min(Math.max(Number(request.query.limit || 100), 1), 1000);
    response.json({
        items: [...auditEvents.values()].slice(-limit).reverse(),
        indexing: {
            chaincodeEvents: { ready: eventStreamReady, error: eventStreamError },
            blockEvents: { ready: blockStreamReady, error: blockStreamError }
        }
    });
});
app.get('/health', (_request, response) => {
    const healthy = eventStreamReady && blockStreamReady && !eventStreamError && !blockStreamError;
    response.status(healthy ? 200 : 503).json({
        ok: healthy,
        credentialEventIndex: eventStreamReady && !eventStreamError,
        validationEventIndex: blockStreamReady && !blockStreamError,
        auditEventCount: auditEvents.size
    });
});
app.get('/metrics', (_request, response) => {
    response.type('text/plain').send([
        '# HELP synapsenet_audit_events_total Persisted sanitized Fabric audit events',
        '# TYPE synapsenet_audit_events_total gauge',
        `synapsenet_audit_events_total ${auditEvents.size}`,
        `synapsenet_event_stream_ready ${eventStreamReady ? 1 : 0}`,
        `synapsenet_block_stream_ready ${blockStreamReady ? 1 : 0}`,
        ''
    ].join('\n'));
});
const server = app.listen(PORT, '0.0.0.0');
void indexCredentialTransactions();
void indexValidationEvents();
function shutdown() {
    for (const callerGateway of identityGateways.values()) callerGateway.close();
    gateway.close();
    client.close();
    server.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
