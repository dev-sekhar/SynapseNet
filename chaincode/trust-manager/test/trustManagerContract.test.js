const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const { Wallet } = require('ethers');
const stringify = require('json-stringify-deterministic');
const crypto = require('node:crypto');
const { TrustManagerContract } = require('../dist');

let contract;
let context;
let state;
let events;
let ledgerTime;

beforeEach(() => {
    contract = new TrustManagerContract();
    state = new Map();
    events = [];
    ledgerTime = 1710000000;
    context = {
        clientIdentity: {
            getID: () => 'x509::governance',
            getMSPID: () => 'PlatformMSP'
        },
        stub: {
            createCompositeKey: (type, parts) => `${type}\u0000${parts.join('\u0000')}\u0000`,
            getState: async (key) => state.get(key) ?? Buffer.alloc(0),
            putState: async (key, value) => state.set(key, value),
            setEvent: (name, payload) => events.push({ name, payload }),
            getTxTimestamp: () => ({ seconds: { toString: () => String(ledgerTime) } })
        }
    };
});

function policy() {
    return JSON.stringify({
        version: 'policy-1',
        governanceMspIds: ['PlatformMSP'],
        penaltyBurnBasisPoints: [1000, 2500, 10000],
        incidentResponseSeconds: 1209600,
        appealSeconds: 1209600,
        reputationRewards: { verified_performance: 5 },
        reputationPenalties: { confirmed_misconduct: 20 }
    });
}

async function signedIntent(wallet, action, actorId, nonce, payload) {
    const intent = {
        domain: 'SynapseNet',
        version: '1',
        action,
        actorId,
        walletAddress: wallet.address,
        payloadHash: `sha256:${crypto.createHash('sha256').update(stringify(payload)).digest('hex')}`,
        nonce,
        expiresAt: 1810000000
    };
    const canonical = stringify(intent);
    return { json: JSON.stringify(intent), signature: await wallet.signMessage(canonical) };
}

async function register(actorId, wallet, actorType = 'user') {
    const payload = {
        actorId,
        actorType,
        walletAddress: wallet.address.toLowerCase(),
        authoritativeMspId: 'PlatformMSP'
    };
    const intent = await signedIntent(
        wallet, 'registerParticipant', actorId, `nonce-${actorId}`, payload
    );
    await contract.registerParticipant(
        context,
        actorId,
        actorType,
        wallet.address,
        'PlatformMSP',
        intent.json,
        intent.signature
    );
}

test('links a MetaMask wallet to an MSP-authorized participant', async () => {
    const wallet = Wallet.createRandom();
    await contract.initializePolicy(context, policy());
    await register('user-a', wallet);
    const participant = JSON.parse(await contract.getParticipant(context, 'user-a'));
    assert.equal(participant.walletAddress, wallet.address.toLowerCase());
    assert.equal(participant.authoritativeMspId, 'PlatformMSP');
    assert.ok(events.some(({ name }) => name === 'WalletIdentityLinked'));
});

test('rejects replay of a wallet-signed intent', async () => {
    const wallet = Wallet.createRandom();
    await contract.initializePolicy(context, policy());
    const payload = {
        actorId: 'user-a',
        actorType: 'user',
        walletAddress: wallet.address.toLowerCase(),
        authoritativeMspId: 'PlatformMSP'
    };
    const intent = await signedIntent(
        wallet, 'registerParticipant', 'user-a', 'same-nonce', payload
    );
    await contract.registerParticipant(
        context, 'user-a', 'user', wallet.address, 'PlatformMSP', intent.json, intent.signature
    );
    await assert.rejects(
        contract.registerParticipant(
            context, 'user-a', 'user', wallet.address, 'PlatformMSP', intent.json, intent.signature
        ),
        /intentNonce .* already exists/
    );
});

test('issues progressive penalty directives and suspends on third incident', async () => {
    const accused = Wallet.createRandom();
    const reporter = Wallet.createRandom();
    await contract.initializePolicy(context, policy());
    await register('accused', accused);
    await register('reporter', reporter);

    for (let number = 1; number <= 3; number += 1) {
        const incidentId = `incident-${number}`;
        const incident = {
            incidentId,
            accusedActorId: 'accused',
            reporterActorId: 'reporter',
            allegationHash: `sha256:${String(number).repeat(64)}`
        };
        const intent = await signedIntent(
            reporter, 'reportIncident', 'reporter', `report-${number}`, incident
        );
        await contract.reportIncident(
            context, JSON.stringify(incident), intent.json, intent.signature
        );
        await contract.decideIncident(
            context, incidentId, 'confirmed', `sha256:${'f'.repeat(64)}`
        );
        ledgerTime += 1209601;
        const directiveId = await contract.finalizeIncident(
            context, incidentId, 'confirmed'
        );
        const directiveKey = context.stub.createCompositeKey('penaltyDirective', [directiveId]);
        const directive = JSON.parse(state.get(directiveKey).toString());
        assert.equal(directive.burnBasisPoints, [1000, 2500, 10000][number - 1]);
    }

    const participant = JSON.parse(await contract.getParticipant(context, 'accused'));
    assert.equal(participant.confirmedIncidents, 3);
    assert.equal(participant.status, 'suspended');
});

test('only governance MSP can decide incidents or award REP', async () => {
    const wallet = Wallet.createRandom();
    await contract.initializePolicy(context, policy());
    await register('user-a', wallet);
    context.clientIdentity.getMSPID = () => 'UntrustedMSP';
    await assert.rejects(
        contract.awardReputation(context, 'user-a', 'verified_performance', 'credential-1'),
        /Governance MSP authorization/
    );
});

test('governance activates a new immutable policy version', async () => {
    await contract.initializePolicy(context, policy());
    const nextPolicy = JSON.parse(policy());
    nextPolicy.version = 'policy-2';
    nextPolicy.penaltyBurnBasisPoints = [1200, 3000, 10000];
    await contract.activatePolicy(context, JSON.stringify(nextPolicy));
    const active = JSON.parse(await contract.getActivePolicy(context));
    assert.equal(active.version, 'policy-2');
    assert.deepEqual(active.penaltyBurnBasisPoints, [1200, 3000, 10000]);
});
