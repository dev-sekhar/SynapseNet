import { Context, Contract, Info } from 'fabric-contract-api';
import { SkillManagerContract } from './skillManagerContract';

abstract class CredentialDomainContract extends Contract {
    protected readonly domain = new SkillManagerContract();
}

@Info({ title: 'IdentityContract', description: 'Credential-network participant and issuer registry' })
export class IdentityContract extends CredentialDomainContract {
    constructor() { super('SynapseNet.IdentityContract'); }
    public InitLedger(ctx: Context) { return this.domain.InitLedger(ctx); }
    public registerUser(ctx: Context, userId: string, displayName: string) {
        return this.domain.registerUser(ctx, userId, displayName);
    }
    public registerEnterprise(ctx: Context, enterpriseId: string, name: string, reviewerId: string) {
        return this.domain.registerEnterprise(ctx, enterpriseId, name, reviewerId);
    }
    public addEnterpriseReviewer(ctx: Context, enterpriseId: string, reviewerId: string) {
        return this.domain.addEnterpriseReviewer(ctx, enterpriseId, reviewerId);
    }
    public getUsers(ctx: Context) { return this.domain.getUsers(ctx); }
    public getEnterprises(ctx: Context) { return this.domain.getEnterprises(ctx); }
}

@Info({ title: 'CredentialContract', description: 'Evidence-backed credential request and issuance lifecycle' })
export class CredentialContract extends CredentialDomainContract {
    constructor() { super('SynapseNet.CredentialContract'); }
    public submitCredentialRequest(ctx: Context, payloadJson: string) {
        return this.domain.submitCredentialRequest(ctx, payloadJson);
    }
    public reviewCredentialRequest(
        ctx: Context, requestId: string, reviewerId: string, decision: string, notes: string
    ) {
        return this.domain.reviewCredentialRequest(ctx, requestId, reviewerId, decision, notes);
    }
    public getCredentialRequests(ctx: Context) { return this.domain.getCredentialRequests(ctx); }
    public getWallet(ctx: Context, userId: string) { return this.domain.getWallet(ctx, userId); }
    public getIssuedCredentials(ctx: Context, enterpriseId: string) {
        return this.domain.getIssuedCredentials(ctx, enterpriseId);
    }
}

@Info({ title: 'WalletContract', description: 'Credential wallet and SNT accounting projections' })
export class WalletContract extends CredentialDomainContract {
    constructor() { super('SynapseNet.WalletContract'); }
    public openWallet(ctx: Context, ownerId: string, ownerType: string) {
        return this.domain.openWallet(ctx, ownerId, ownerType);
    }
    public getWalletAccount(ctx: Context, ownerId: string) {
        return this.domain.getWalletAccount(ctx, ownerId);
    }
    public getTokenTransactions(ctx: Context, ownerId: string) {
        return this.domain.getTokenTransactions(ctx, ownerId);
    }
}

@Info({ title: 'TokenContract', description: 'Idempotent SNT issuance and penalty accounting' })
export class TokenContract extends CredentialDomainContract {
    constructor() { super('SynapseNet.TokenContract'); }
    public executePenaltyDirective(
        ctx: Context, directiveId: string, actorId: string, ownerId: string, burnBasisPoints: string
    ) {
        return this.domain.executePenaltyDirective(
            ctx, directiveId, actorId, ownerId, burnBasisPoints
        );
    }
}

@Info({ title: 'SharingContract', description: 'Purpose-bound selective credential disclosure' })
export class SharingContract extends CredentialDomainContract {
    constructor() { super('SynapseNet.SharingContract'); }
    public createShareGrant(ctx: Context, payloadJson: string) {
        return this.domain.createShareGrant(ctx, payloadJson);
    }
    public revokeShareGrant(ctx: Context, shareId: string, ownerId: string) {
        return this.domain.revokeShareGrant(ctx, shareId, ownerId);
    }
    public getShareGrant(ctx: Context, shareId: string) {
        return this.domain.getShareGrant(ctx, shareId);
    }
    public getSharedCredentials(ctx: Context, recipientId: string) {
        return this.domain.getSharedCredentials(ctx, recipientId);
    }
}
