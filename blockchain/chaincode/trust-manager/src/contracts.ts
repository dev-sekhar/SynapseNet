import { Context, Contract, Info } from 'fabric-contract-api';
import { ParticipantType } from './models';
import { TrustManagerContract } from './trustManagerContract';

abstract class TrustDomainContract extends Contract {
    protected readonly domain = new TrustManagerContract();
}

@Info({ title: 'TrustPolicyContract', description: 'Versioned trust policy governance' })
export class TrustPolicyContract extends TrustDomainContract {
    constructor() { super('SynapseNet.TrustPolicyContract'); }
    public initializePolicy(ctx: Context, policyJson: string) {
        return this.domain.initializePolicy(ctx, policyJson);
    }
    public activatePolicy(ctx: Context, policyJson: string) {
        return this.domain.activatePolicy(ctx, policyJson);
    }
    public getActivePolicy(ctx: Context) { return this.domain.getActivePolicy(ctx); }
}

@Info({ title: 'ParticipantTrustContract', description: 'Wallet-bound trust participants' })
export class ParticipantTrustContract extends TrustDomainContract {
    constructor() { super('SynapseNet.ParticipantTrustContract'); }
    public registerParticipant(
        ctx: Context,
        actorId: string,
        actorType: ParticipantType,
        walletAddress: string,
        authoritativeMspId: string,
        intentJson: string,
        signature: string
    ) {
        return this.domain.registerParticipant(
            ctx, actorId, actorType, walletAddress, authoritativeMspId, intentJson, signature
        );
    }
    public getParticipant(ctx: Context, actorId: string) {
        return this.domain.getParticipant(ctx, actorId);
    }
}

@Info({ title: 'IncidentContract', description: 'Trust incident and appeal lifecycle' })
export class IncidentContract extends TrustDomainContract {
    constructor() { super('SynapseNet.IncidentContract'); }
    public reportIncident(ctx: Context, incidentJson: string, intentJson: string, signature: string) {
        return this.domain.reportIncident(ctx, incidentJson, intentJson, signature);
    }
    public decideIncident(ctx: Context, incidentId: string, decision: 'confirmed' | 'dismissed', reasonHash: string) {
        return this.domain.decideIncident(ctx, incidentId, decision, reasonHash);
    }
    public respondToIncident(ctx: Context, incidentId: string, responseHash: string) {
        return this.domain.respondToIncident(ctx, incidentId, responseHash);
    }
    public appealIncident(ctx: Context, incidentId: string, intentJson: string, signature: string) {
        return this.domain.appealIncident(ctx, incidentId, intentJson, signature);
    }
    public finalizeIncident(ctx: Context, incidentId: string, finalDecision: 'confirmed' | 'dismissed') {
        return this.domain.finalizeIncident(ctx, incidentId, finalDecision);
    }
    public getIncident(ctx: Context, incidentId: string) {
        return this.domain.getIncident(ctx, incidentId);
    }
    public getCredentialTrustStatus(ctx: Context, credentialId: string) {
        return this.domain.getCredentialTrustStatus(ctx, credentialId);
    }
}

@Info({ title: 'ReputationContract', description: 'Policy-governed participant reputation' })
export class ReputationContract extends TrustDomainContract {
    constructor() { super('SynapseNet.ReputationContract'); }
    public awardReputation(ctx: Context, actorId: string, performanceType: string, referenceId: string) {
        return this.domain.awardReputation(ctx, actorId, performanceType, referenceId);
    }
}
