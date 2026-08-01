import { Context, Contract, Info } from 'fabric-contract-api';
import { createHash } from 'node:crypto';
import { getAddress, verifyMessage } from 'ethers';
import stringify from 'json-stringify-deterministic';
import {
    Incident,
    CredentialTrustProjection,
    Participant,
    ParticipantStatus,
    ParticipantType,
    PenaltyDirective,
    Policy,
    SignedIntent
} from './models';

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:@-]{0,127}$/;
const HASH = /^(sha256:)?[a-fA-F0-9]{64}$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const MAX_TRANSACTION_PAYLOAD_BYTES = 32 * 1024;

@Info({ title: 'TrustManagerContract', description: 'Wallet identity and reputation context' })
export class TrustManagerContract extends Contract {
    constructor() {
        super('SynapseNet.TrustManagerContract');
    }

    public async initializePolicy(ctx: Context, policyJson: string): Promise<string> {
        const existing = await ctx.stub.getState(ctx.stub.createCompositeKey('trustPolicyActive', []));
        if (existing.length) throw new Error('Trust policy is already initialized');
        const policy = this.policy(policyJson, this.time(ctx));
        if (!policy.governanceMspIds.includes(ctx.clientIdentity.getMSPID())) {
            throw new Error('Submitting MSP is not a configured governance member');
        }
        await this.put(ctx, 'trustPolicy', policy.version, policy);
        await ctx.stub.putState(
            ctx.stub.createCompositeKey('trustPolicyActive', []),
            Buffer.from(policy.version)
        );
        this.event(ctx, 'TrustPolicyActivated', { version: policy.version });
        return policy.version;
    }

    public async activatePolicy(ctx: Context, policyJson: string): Promise<string> {
        await this.requireGovernance(ctx);
        const policy = this.policy(policyJson, this.time(ctx));
        await this.missing(ctx, 'trustPolicy', policy.version);
        await this.put(ctx, 'trustPolicy', policy.version, policy);
        await ctx.stub.putState(
            ctx.stub.createCompositeKey('trustPolicyActive', []),
            Buffer.from(policy.version)
        );
        this.event(ctx, 'TrustPolicyActivated', { version: policy.version });
        return policy.version;
    }

    public async registerParticipant(
        ctx: Context,
        actorId: string,
        actorType: ParticipantType,
        walletAddress: string,
        authoritativeMspId: string,
        intentJson: string,
        signature: string
    ): Promise<string> {
        const id = this.id(actorId);
        if (!['user', 'enterprise', 'reviewer'].includes(actorType)) {
            throw new Error('actorType is invalid');
        }
        if (ctx.clientIdentity.getMSPID() !== authoritativeMspId) {
            throw new Error('Participant must be registered by its authoritative MSP');
        }
        const address = getAddress(walletAddress).toLowerCase();
        const existingBytes = await ctx.stub.getState(
            ctx.stub.createCompositeKey('trustParticipant', [id])
        );
        await this.authorizeIntent(
            ctx,
            intentJson,
            signature,
            'registerParticipant',
            id,
            address,
            this.payloadHash({ actorId: id, actorType, walletAddress: address, authoritativeMspId })
        );
        if (existingBytes.length) {
            const existing = JSON.parse(existingBytes.toString()) as Participant;
            if (existing.walletAddress !== address ||
                existing.actorType !== actorType ||
                existing.authoritativeMspId !== authoritativeMspId) {
                throw new Error('Participant is already linked to a different identity');
            }
            return id;
        }
        await this.missing(ctx, 'walletBinding', address);
        const participant: Participant = {
            docType: 'trustParticipant',
            actorId: id,
            actorType,
            walletAddress: address,
            authoritativeMspId,
            reputation: 0,
            confirmedIncidents: 0,
            status: 'active',
            createdAt: this.time(ctx)
        };
        await this.put(ctx, 'trustParticipant', id, participant);
        await this.put(ctx, 'walletBinding', address, { actorId: id, walletAddress: address });
        this.event(ctx, 'WalletIdentityLinked', { actorId: id, walletAddress: address });
        return id;
    }

    public async reportIncident(
        ctx: Context,
        incidentJson: string,
        intentJson: string,
        signature: string
    ): Promise<string> {
        const input = this.object(incidentJson);
        const incidentId = this.id(String(input.incidentId || ''));
        const reporterActorId = this.id(String(input.reporterActorId || ''));
        const reporter = await this.get<Participant>(ctx, 'trustParticipant', reporterActorId);
        await this.authorizeIntent(
            ctx,
            intentJson,
            signature,
            'reportIncident',
            reporterActorId,
            reporter.walletAddress,
            this.payloadHash(input)
        );
        await this.get<Participant>(
            ctx, 'trustParticipant', this.id(String(input.accusedActorId || ''))
        );
        await this.missing(ctx, 'misconductIncident', incidentId);
        const policy = await this.activePolicy(ctx);
        const incident: Incident = {
            docType: 'misconductIncident',
            incidentId,
            accusedActorId: String(input.accusedActorId),
            reporterActorId,
            credentialId: input.credentialId ? this.id(String(input.credentialId)) : undefined,
            allegationHash: this.hash(String(input.allegationHash || '')),
            status: 'reported',
            policyVersion: policy.version,
            createdAt: this.time(ctx),
            responseDueAt: this.epoch(ctx) + policy.incidentResponseSeconds,
            appealUsed: false
        };
        await this.put(ctx, 'misconductIncident', incidentId, incident);
        if (incident.credentialId) {
            await this.projectCredential(ctx, incident, 'challenged');
        }
        this.event(ctx, 'MisconductReported', { incidentId, reporterActorId });
        return incidentId;
    }

    public async decideIncident(
        ctx: Context,
        incidentId: string,
        decision: 'confirmed' | 'dismissed',
        reasonHash: string
    ): Promise<string> {
        await this.requireGovernance(ctx);
        const incident = await this.get<Incident>(
            ctx, 'misconductIncident', this.id(incidentId)
        );
        if (!['reported', 'investigating', 'appealed'].includes(incident.status)) {
            throw new Error('Incident cannot be decided from its current status');
        }
        if (!['confirmed', 'dismissed'].includes(decision)) throw new Error('decision is invalid');
        incident.status = decision;
        incident.decidedAt = this.time(ctx);
        incident.appealDueAt = this.epoch(ctx) +
            (await this.get<Policy>(ctx, 'trustPolicy', incident.policyVersion)).appealSeconds;
        incident.decisionReasonHash = this.hash(reasonHash);
        await this.put(ctx, 'misconductIncident', incident.incidentId, incident);
        if (decision === 'dismissed') {
            if (incident.credentialId) await this.projectCredential(ctx, incident, 'trusted');
            this.event(ctx, 'MisconductDismissed', { incidentId: incident.incidentId });
            return '';
        }
        this.event(ctx, 'MisconductConfirmedPendingAppeal', {
            incidentId: incident.incidentId, appealDueAt: incident.appealDueAt
        });
        return '';
    }

    public async respondToIncident(
        ctx: Context, incidentId: string, responseHash: string
    ): Promise<void> {
        const incident = await this.get<Incident>(ctx, 'misconductIncident', this.id(incidentId));
        const accused = await this.get<Participant>(ctx, 'trustParticipant', incident.accusedActorId);
        if (ctx.clientIdentity.getMSPID() !== accused.authoritativeMspId) {
            throw new Error('Only the accused participant authoritative MSP may respond');
        }
        if (incident.status !== 'reported' || this.epoch(ctx) > incident.responseDueAt) {
            throw new Error('Incident response period is not active');
        }
        incident.status = 'investigating';
        incident.issuerResponseHash = this.hash(responseHash);
        await this.put(ctx, 'misconductIncident', incident.incidentId, incident);
        this.event(ctx, 'IncidentResponseRecorded', { incidentId: incident.incidentId });
    }

    public async appealIncident(
        ctx: Context, incidentId: string, intentJson: string, signature: string
    ): Promise<void> {
        const incident = await this.get<Incident>(ctx, 'misconductIncident', this.id(incidentId));
        const accused = await this.get<Participant>(ctx, 'trustParticipant', incident.accusedActorId);
        if (incident.status !== 'confirmed' || incident.appealUsed ||
            !incident.appealDueAt || this.epoch(ctx) > incident.appealDueAt) {
            throw new Error('Incident is not appealable');
        }
        await this.authorizeIntent(
            ctx, intentJson, signature, 'appealIncident', accused.actorId,
            accused.walletAddress,
            this.payloadHash({ incidentId: incident.incidentId, actorId: accused.actorId })
        );
        incident.status = 'appealed';
        incident.appealUsed = true;
        await this.put(ctx, 'misconductIncident', incident.incidentId, incident);
        this.event(ctx, 'IncidentAppealed', { incidentId: incident.incidentId });
    }

    public async finalizeIncident(
        ctx: Context, incidentId: string, finalDecision: 'confirmed' | 'dismissed'
    ): Promise<string> {
        await this.requireGovernance(ctx);
        const incident = await this.get<Incident>(ctx, 'misconductIncident', this.id(incidentId));
        if (incident.status === 'reported' && this.epoch(ctx) > incident.responseDueAt) {
            incident.status = 'issuer_unresponsive';
            if (incident.credentialId) {
                await this.projectCredential(ctx, incident, 'issuer_unresponsive');
            }
            await this.put(ctx, 'misconductIncident', incident.incidentId, incident);
            this.event(ctx, 'IssuerUnresponsive', { incidentId: incident.incidentId });
            return '';
        }
        const appealExpired = incident.status === 'confirmed' &&
            incident.appealDueAt && this.epoch(ctx) > incident.appealDueAt;
        if (!appealExpired && incident.status !== 'appealed') {
            throw new Error('Incident is not ready for final decision');
        }
        incident.status = 'final';
        incident.finalDecision = finalDecision;
        await this.put(ctx, 'misconductIncident', incident.incidentId, incident);
        if (finalDecision === 'dismissed') {
            if (incident.credentialId) await this.projectCredential(ctx, incident, 'trusted');
            this.event(ctx, 'AppealResolved', { incidentId: incident.incidentId, finalDecision });
            return '';
        }

        const participant = await this.get<Participant>(
            ctx, 'trustParticipant', incident.accusedActorId
        );
        const policy = await this.get<Policy>(ctx, 'trustPolicy', incident.policyVersion);
        participant.confirmedIncidents += 1;
        const index = Math.min(
            participant.confirmedIncidents - 1,
            policy.penaltyBurnBasisPoints.length - 1
        );
        participant.reputation = Math.max(
            0,
            participant.reputation - (policy.reputationPenalties.confirmed_misconduct || 0)
        );
        participant.status = participant.confirmedIncidents >= 3 ? 'suspended' : 'probation';
        await this.put(ctx, 'trustParticipant', participant.actorId, participant);
        const directive: PenaltyDirective = {
            docType: 'penaltyDirective',
            directiveId: `penalty-${incident.incidentId}`,
            incidentId: incident.incidentId,
            actorId: participant.actorId,
            burnBasisPoints: policy.penaltyBurnBasisPoints[index],
            incidentNumber: participant.confirmedIncidents,
            policyVersion: policy.version,
            status: 'pending_token_execution',
            createdAt: this.time(ctx)
        };
        await this.put(ctx, 'penaltyDirective', directive.directiveId, directive);
        this.event(ctx, 'MisconductConfirmed', {
            incidentId: incident.incidentId,
            actorId: participant.actorId
        });
        this.event(ctx, 'PenaltyDirected', directive);
        if (incident.credentialId) await this.projectCredential(ctx, incident, 'invalidated');
        return directive.directiveId;
    }

    public async awardReputation(
        ctx: Context, actorId: string, performanceType: string, referenceId: string
    ): Promise<number> {
        await this.requireGovernance(ctx);
        const participant = await this.get<Participant>(
            ctx, 'trustParticipant', this.id(actorId)
        );
        const policy = await this.activePolicy(ctx);
        const amount = policy.reputationRewards[performanceType];
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error('Performance type has no configured reputation reward');
        }
        const awardId = `${participant.actorId}:${this.id(referenceId)}:${performanceType}`;
        await this.missing(ctx, 'reputationAward', awardId);
        participant.reputation += amount;
        await this.put(ctx, 'trustParticipant', participant.actorId, participant);
        await this.put(ctx, 'reputationAward', awardId, {
            actorId: participant.actorId, performanceType, amount, policyVersion: policy.version
        });
        this.event(ctx, 'ReputationAwarded', { actorId: participant.actorId, amount });
        return participant.reputation;
    }

    public async getParticipant(ctx: Context, actorId: string): Promise<string> {
        return this.serialize(await this.get<Participant>(
            ctx, 'trustParticipant', this.id(actorId)
        ));
    }

    public async getIncident(ctx: Context, incidentId: string): Promise<string> {
        return this.serialize(await this.get<Incident>(
            ctx, 'misconductIncident', this.id(incidentId)
        ));
    }

    public async getActivePolicy(ctx: Context): Promise<string> {
        return this.serialize(await this.activePolicy(ctx));
    }

    public async getCredentialTrustStatus(ctx: Context, credentialId: string): Promise<string> {
        return this.serialize(await this.get<CredentialTrustProjection>(
            ctx, 'credentialTrustProjection', this.id(credentialId)
        ));
    }

    private async authorizeIntent(
        ctx: Context,
        intentJson: string,
        signature: string,
        action: string,
        actorId: string,
        walletAddress: string,
        expectedPayloadHash: string
    ): Promise<void> {
        const intent = this.object(intentJson) as unknown as SignedIntent;
        if (intent.domain !== 'SynapseNet' || intent.version !== '1') {
            throw new Error('Signed intent domain or version is invalid');
        }
        if (intent.action !== action || intent.actorId !== actorId) {
            throw new Error('Signed intent does not authorize this action');
        }
        if (getAddress(intent.walletAddress).toLowerCase() !== walletAddress) {
            throw new Error('Signed intent wallet does not match');
        }
        const now = Number(ctx.stub.getTxTimestamp().seconds.toString());
        if (!Number.isSafeInteger(intent.expiresAt) || intent.expiresAt < now) {
            throw new Error('Signed intent has expired');
        }
        if (this.hash(intent.payloadHash) !== expectedPayloadHash) {
            throw new Error('Signed intent payload hash does not match transaction parameters');
        }
        const nonce = this.id(intent.nonce);
        await this.missing(ctx, 'intentNonce', `${walletAddress}:${nonce}`);
        const canonical = this.serialize(intent);
        if (verifyMessage(canonical, signature).toLowerCase() !== walletAddress) {
            throw new Error('Signed intent signature is invalid');
        }
        await this.put(ctx, 'intentNonce', `${walletAddress}:${nonce}`, {
            walletAddress, nonce, action, usedAt: this.time(ctx)
        });
    }

    private async requireGovernance(ctx: Context): Promise<void> {
        const policy = await this.activePolicy(ctx);
        if (!policy.governanceMspIds.includes(ctx.clientIdentity.getMSPID())) {
            throw new Error('Governance MSP authorization is required');
        }
    }

    private async activePolicy(ctx: Context): Promise<Policy> {
        const version = await ctx.stub.getState(ctx.stub.createCompositeKey('trustPolicyActive', []));
        if (!version.length) throw new Error('Trust policy is not initialized');
        return this.get<Policy>(ctx, 'trustPolicy', version.toString());
    }

    private policy(json: string, effectiveAt: string): Policy {
        const input = this.object(json);
        const rates = input.penaltyBurnBasisPoints;
        if (!Array.isArray(rates) || rates.length !== 3 ||
            rates.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 10_000)) {
            throw new Error('Policy requires three burn rates in basis points');
        }
        const governanceMspIds = input.governanceMspIds;
        if (!Array.isArray(governanceMspIds) || governanceMspIds.length === 0) {
            throw new Error('Policy requires governance MSP IDs');
        }
        return {
            docType: 'trustPolicy',
            version: this.id(String(input.version || '')),
            governanceMspIds: governanceMspIds.map((value) => this.id(String(value))),
            penaltyBurnBasisPoints: rates,
            reputationRewards: this.numberMap(input.reputationRewards),
            reputationPenalties: this.numberMap(input.reputationPenalties),
            incidentResponseSeconds: this.positiveInteger(
                input.incidentResponseSeconds, 'incidentResponseSeconds'
            ),
            appealSeconds: this.positiveInteger(input.appealSeconds, 'appealSeconds'),
            effectiveAt
        };
    }

    private numberMap(value: unknown): Record<string, number> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('Policy reward and penalty maps are required');
        }
        const result: Record<string, number> = {};
        for (const [key, amount] of Object.entries(value)) {
            if (!ID.test(key) || !Number.isSafeInteger(amount) || Number(amount) < 0) {
                throw new Error('Policy map contains an invalid entry');
            }
            result[key] = Number(amount);
        }
        return result;
    }

    private async get<T>(ctx: Context, type: string, id: string): Promise<T> {
        const value = await ctx.stub.getState(ctx.stub.createCompositeKey(type, [id]));
        if (!value.length) throw new Error(`${type} ${id} does not exist`);
        return JSON.parse(value.toString()) as T;
    }

    private async put(ctx: Context, type: string, id: string, value: unknown): Promise<void> {
        await ctx.stub.putState(ctx.stub.createCompositeKey(type, [id]), Buffer.from(this.serialize(value)));
    }

    private async missing(ctx: Context, type: string, id: string): Promise<void> {
        if ((await ctx.stub.getState(ctx.stub.createCompositeKey(type, [id]))).length) {
            throw new Error(`${type} ${id} already exists`);
        }
    }

    private object(json: string): Record<string, unknown> {
        if (Buffer.byteLength(json, 'utf8') > MAX_TRANSACTION_PAYLOAD_BYTES) {
            throw new Error(`payload must not exceed ${MAX_TRANSACTION_PAYLOAD_BYTES} bytes`);
        }
        const value = JSON.parse(json);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required');
        return value as Record<string, unknown>;
    }

    private id(value: string): string {
        if (!ID.test(value)) throw new Error('Identifier is invalid');
        return value;
    }

    private hash(value: string): string {
        if (!HASH.test(value)) throw new Error('SHA-256 hash is invalid');
        return value.toLowerCase();
    }

    private payloadHash(value: unknown): string {
        return `sha256:${createHash('sha256').update(this.serialize(value)).digest('hex')}`;
    }

    private positiveInteger(value: unknown, field: string): number {
        if (!Number.isSafeInteger(value) || Number(value) <= 0) {
            throw new Error(`${field} must be a positive integer`);
        }
        return Number(value);
    }

    private async projectCredential(
        ctx: Context,
        incident: Incident,
        status: CredentialTrustProjection['status']
    ): Promise<void> {
        if (!incident.credentialId) return;
        await this.put(ctx, 'credentialTrustProjection', incident.credentialId, {
            docType: 'credentialTrustProjection',
            credentialId: incident.credentialId,
            status,
            incidentId: incident.incidentId,
            updatedAt: this.time(ctx)
        } as CredentialTrustProjection);
        this.event(ctx, 'CredentialTrustStatusChanged', {
            credentialId: incident.credentialId, status, incidentId: incident.incidentId
        });
    }

    private epoch(ctx: Context): number {
        return Number(ctx.stub.getTxTimestamp().seconds.toString());
    }

    private time(ctx: Context): string {
        return ctx.stub.getTxTimestamp().seconds.toString();
    }

    private serialize(value: unknown): string {
        return stringify(value);
    }

    private event(ctx: Context, name: string, payload: unknown): void {
        ctx.stub.setEvent(name, Buffer.from(this.serialize(payload)));
    }
}
