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
        'getIncident', 'getActivePolicy', 'getCredentialTrustStatus'
    ])],
    ['skill-manager', new Set([
        'getWalletAccount', 'getWallet', 'getIssuedCredentials', 'getCredentialRequests',
        'getTokenTransactions', 'getShareGrant'
    ])]
]);
const smartContracts = new Map([
    ['trust-manager', new Map([
        ...['getActivePolicy'].map((transaction) => [transaction, 'SynapseNet.TrustPolicyContract']),
        ...['registerParticipant', 'getParticipant']
            .map((transaction) => [transaction, 'SynapseNet.ParticipantTrustContract']),
        ...['reportIncident', 'appealIncident', 'getIncident', 'getCredentialTrustStatus']
            .map((transaction) => [transaction, 'SynapseNet.IncidentContract'])
    ])],
    ['skill-manager', new Map([
        ...['getWallet', 'getIssuedCredentials', 'getCredentialRequests']
            .map((transaction) => [transaction, 'SynapseNet.CredentialContract']),
        ...['getWalletAccount', 'getTokenTransactions']
            .map((transaction) => [transaction, 'SynapseNet.WalletContract']),
        ['getShareGrant', 'SynapseNet.SharingContract']
    ])]
]);
const schema = z.object({
    contract: z.string(),
    transaction: z.string(),
    args: z.array(z.string()).max(12),
    submit: z.boolean()
});
const credentialTransactions = new Map();
let eventStreamError = null;
let eventStreamReady = false;

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
                credentialTransactions.set(event.transactionId, {
                    transactionHash: event.transactionId,
                    blockNumber: event.blockNumber.toString(),
                    validationStatus: 'VALID',
                    ...transaction
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
        const contract = networks.get(command.contract).getContract(
            command.contract, smartContract
        );
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
const server = app.listen(PORT, '0.0.0.0');
void indexCredentialTransactions();
function shutdown() {
    gateway.close();
    client.close();
    server.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
