const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const { SkillManagerContract } = require('../dist');

let contract;
let state;
let events;
let context;
let validationPolicies;

beforeEach(() => {
    contract = new SkillManagerContract();
    state = new Map();
    events = [];
    validationPolicies = new Map();
    context = {
        clientIdentity: {
            getID: () => 'x509::/CN=Admin@org1.synapsenet.com',
            getMSPID: () => 'Org1MSP'
        },
        stub: {
            createCompositeKey: (type, parts) => `${type}\u0000${parts.join('\u0000')}\u0000`,
            getState: async (key) => state.get(key) ?? Buffer.alloc(0),
            putState: async (key, value) => state.set(key, value),
            setStateValidationParameter: async (key, policy) => validationPolicies.set(key, policy),
            setEvent: (name, payload) => events.push({ name, payload }),
            getTxID: () => 'fabric-transaction-1',
            getTxTimestamp: () => ({ seconds: { toString: () => '1710000000' } }),
            getStateByPartialCompositeKey: async (type, parts = []) => {
                const prefix = `${type}\u0000${parts.length ? `${parts.join('\u0000')}\u0000` : ''}`;
                const values = [...state.entries()]
                    .filter(([key]) => key.startsWith(prefix))
                    .map(([, value]) => value);
                let index = 0;
                return {
                    next: async () => index < values.length
                        ? { done: false, value: { value: values[index++] } }
                        : { done: true },
                    close: async () => undefined
                };
            }
        }
    };
});

async function onboard() {
    await contract.registerUser(context, 'user-a', 'User A');
    await contract.registerEnterprise(context, 'iit-madras', 'IIT Madras', 'reviewer-iitm');
}

function requestPayload(overrides = {}) {
    return JSON.stringify({
        requestId: 'request-1',
        userId: 'user-a',
        enterpriseId: 'iit-madras',
        credentialType: 'skill',
        title: 'Hyperledger Fabric',
        details: {
            proficiencyLevel: 'Intermediate',
            yearsExperience: 3.5,
            practicalApplication: 'Built and operated a credential verification network.',
            tools: ['Fabric', 'TypeScript'],
            lastUsed: '2026-08',
            attestations: ['manager@example.com']
        },
        evidence: [{
            evidenceId: 'evidence-1',
            documentType: 'Certificate',
            fileName: 'fabric.pdf',
            contentHash: `sha256:${'a'.repeat(64)}`,
            storageProvider: 'google-drive',
            storageReference: 'encrypted-reference'
        }],
        ...overrides
    });
}

test('records user and enterprise onboarding events', async () => {
    await onboard();
    assert.equal(JSON.parse(await contract.getUsers(context))[0].displayName, 'User A');
    assert.equal(JSON.parse(await contract.getEnterprises(context))[0].name, 'IIT Madras');
    const eventNames = events.map(({ name }) => name);
    assert.ok(eventNames.includes('UserRegistered'));
    assert.ok(eventNames.includes('EnterpriseRegistered'));
    assert.equal(eventNames.filter((name) => name === 'WalletOpened').length, 2);
});

test('submits evidence-backed credential requests as pending', async () => {
    await onboard();
    await contract.submitCredentialRequest(context, requestPayload());
    const request = JSON.parse(await contract.getCredentialRequests(context))[0];
    assert.equal(request.status, 'pending_validation');
    assert.equal(request.evidence[0].hashAlgorithm, 'SHA-256');
    assert.equal(request.transactionId, 'fabric-transaction-1');
    assert.ok(validationPolicies.has(
        context.stub.createCompositeKey('credentialRequest', ['request-1'])
    ));
    const transactionEvent = events.find(({ name }) => name === 'CredentialTransaction');
    assert.equal(JSON.parse(transactionEvent.payload).credentialType, 'skill');
});

test('authorized enterprise reviewer approves a credential into the wallet', async () => {
    await onboard();
    await contract.submitCredentialRequest(context, requestPayload());
    const id = await contract.reviewCredentialRequest(
        context, 'request-1', 'reviewer-iitm', 'approve', 'Evidence verified'
    );
    const wallet = JSON.parse(await contract.getWallet(context, 'user-a'));
    assert.equal(id, 'credential-request-1');
    assert.equal(wallet.length, 1);
    assert.equal(wallet[0].issuerEnterpriseId, 'iit-madras');
    assert.equal(wallet[0].title, 'Hyperledger Fabric');
    const userWallet = JSON.parse(await contract.getWalletAccount(context, 'user-a'));
    const enterpriseWallet = JSON.parse(
        await contract.getWalletAccount(context, 'iit-madras')
    );
    assert.equal(userWallet.tokenBalance, 1000);
    assert.equal(userWallet.tokenIssued, 1000);
    assert.equal(userWallet.tokenUsed, 0);
    assert.equal(userWallet.tokenBurnt, 0);
    assert.equal(userWallet.tokenAvailable, 1000);
    assert.deepEqual(userWallet.ownedCredentialIds, ['credential-request-1']);
    assert.deepEqual(enterpriseWallet.issuedCredentialIds, ['credential-request-1']);
    const tokenTransactions = JSON.parse(
        await contract.getTokenTransactions(context, 'user-a')
    );
    assert.equal(tokenTransactions.length, 1);
    assert.equal(tokenTransactions[0].transactionType, 'issued');
});

test('rejects approval by a reviewer outside the assigned enterprise', async () => {
    await onboard();
    await contract.submitCredentialRequest(context, requestPayload());
    await assert.rejects(
        contract.reviewCredentialRequest(context, 'request-1', 'amazon-reviewer', 'approve', ''),
        /not an authorized reviewer/
    );
});

test('creates a selective, purpose-bound wallet share', async () => {
    await onboard();
    await contract.submitCredentialRequest(context, requestPayload());
    await contract.reviewCredentialRequest(
        context, 'request-1', 'reviewer-iitm', 'approve', 'Verified'
    );
    const shareId = await contract.createShareGrant(context, JSON.stringify({
        shareId: 'share-1',
        ownerId: 'user-a',
        credentialIds: ['credential-request-1'],
        recipient: 'user-a',
        purpose: 'Employment verification',
        validFrom: '2024-01-01T00:00:00.000Z',
        expiresAt: '2034-01-01T00:00:00.000Z'
    }));
    const share = JSON.parse(await contract.getShareGrant(context, shareId));
    assert.deepEqual(share.grant.credentialIds, ['credential-request-1']);
    assert.equal(share.credentials.length, 1);
    const inbox = JSON.parse(await contract.getSharedCredentials(context, 'user-a'));
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].grant.shareId, 'share-1');
    assert.equal(inbox[0].credentials[0].ownerId, 'user-a');
    assert.equal(
        JSON.parse(await contract.getSharedCredentials(context, 'another-user')).length,
        0
    );
});

test('rejects malformed evidence hashes', async () => {
    await onboard();
    await assert.rejects(
        contract.submitCredentialRequest(context, requestPayload({
            evidence: [{
                evidenceId: 'evidence-1',
                documentType: 'resume',
                fileName: 'resume.pdf',
                contentHash: 'not-a-hash',
                storageProvider: 'google-drive'
            }]
        })),
        /must be a SHA-256 hash/
    );
});

test('rejects a reviewer certificate attributed to another actor', async () => {
    await contract.registerUser(context, 'user-cert', 'Certificate User');
    await contract.registerEnterprise(context, 'issuer-cert', 'Certificate Issuer', 'reviewer-cert');
    const payload = JSON.parse(requestPayload());
    payload.requestId = 'request-cert';
    payload.userId = 'user-cert';
    payload.enterpriseId = 'issuer-cert';
    await contract.submitCredentialRequest(context, JSON.stringify(payload));
    context.clientIdentity.getAttributeValue = (name) => name === 'synapsenet.actorId'
        ? 'different-reviewer' : 'reviewer';
    await assert.rejects(
        contract.reviewCredentialRequest(context, 'request-cert', 'reviewer-cert', 'approve', ''),
        /not authorized as reviewer/
    );
});

test('executes each finalized penalty directive exactly once', async () => {
    await onboard();
    const first = JSON.parse(await contract.executePenaltyDirective(
        context, 'directive-1', 'user-a', 'user-a', '1000'
    ));
    const replay = JSON.parse(await contract.executePenaltyDirective(
        context, 'directive-1', 'user-a', 'user-a', '1000'
    ));
    const wallet = JSON.parse(await contract.getWalletAccount(context, 'user-a'));
    const transactions = JSON.parse(await contract.getTokenTransactions(context, 'user-a'));
    assert.equal(first.amount, 100);
    assert.deepEqual(replay, first);
    assert.equal(wallet.tokenBurnt, 100);
    assert.equal(wallet.tokenAvailable, 900);
    assert.equal(transactions.filter((item) => item.transactionType === 'burnt').length, 1);
    await assert.rejects(
        contract.executePenaltyDirective(context, 'directive-1', 'user-a', 'user-a', '2500'),
        /different parameters/
    );
});
