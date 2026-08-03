import { Context, Contract, Info } from 'fabric-contract-api';
import { KeyEndorsementPolicy } from 'fabric-shim';
import stringify from 'json-stringify-deterministic';
import sortKeysRecursive from 'sort-keys-recursive';

type CredentialType = 'skill' | 'role' | 'education' | 'certificate' | 'other';

interface LedgerRecord {
    docType: string;
    createdAt: string;
    submittedBy: string;
    transactionId: string;
}

export interface User extends LedgerRecord {
    docType: 'user';
    userId: string;
    displayName: string;
    status: 'active';
    mspId?: string;
}

export interface Enterprise extends LedgerRecord {
    docType: 'enterprise';
    enterpriseId: string;
    name: string;
    reviewers: string[];
    status: 'active';
    mspId?: string;
}

export interface Evidence {
    evidenceId: string;
    documentType: string;
    fileName: string;
    contentHash: string;
    hashAlgorithm: 'SHA-256';
    storageProvider: string;
    storageReference?: string;
}

export interface CredentialRequest extends LedgerRecord {
    docType: 'credentialRequest';
    requestId: string;
    userId: string;
    enterpriseId: string;
    credentialType: CredentialType;
    title: string;
    details: Record<string, unknown>;
    evidence: Evidence[];
    status: 'pending_validation' | 'approved' | 'rejected';
    reviewedBy?: string;
    reviewedAt?: string;
    reviewNotes?: string;
}

export interface Credential extends LedgerRecord {
    docType: 'credential';
    credentialId: string;
    requestId: string;
    ownerId: string;
    issuerEnterpriseId: string;
    credentialType: CredentialType;
    title: string;
    details: Record<string, unknown>;
    evidence: Evidence[];
    approvedBy: string;
    approvedAt: string;
    status: 'active' | 'revoked';
}

export interface ShareGrant extends LedgerRecord {
    docType: 'shareGrant';
    shareId: string;
    ownerId: string;
    credentialIds: string[];
    recipient: string;
    purpose: string;
    validFrom: string;
    expiresAt: string;
    status: 'active' | 'revoked';
    revokedAt?: string;
}

export interface Wallet extends LedgerRecord {
    docType: 'wallet';
    walletId: string;
    ownerId: string;
    ownerType: 'user' | 'enterprise';
    ownedCredentialIds: string[];
    issuedCredentialIds: string[];
    tokenSymbol: 'SNT';
    tokenBalance: number;
    tokenIssued: number;
    tokenUsed: number;
    tokenBurnt: number;
    tokenAvailable: number;
}

export interface TokenTransaction extends LedgerRecord {
    docType: 'tokenTransaction';
    transactionId: string;
    walletId: string;
    ownerId: string;
    transactionType: 'issued' | 'used' | 'burnt';
    amount: number;
    balanceAfter: number;
    description: string;
    referenceId?: string;
}

interface PenaltyExecution extends LedgerRecord {
    docType: 'penaltyExecution';
    directiveId: string;
    actorId: string;
    ownerId: string;
    burnBasisPoints: number;
    amount: number;
    balanceAfter: number;
    tokenTransactionId: string;
}

const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 160;
const MAX_TEXT_LENGTH = 2_000;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:@-]*$/;
const SHA256_PATTERN = /^(sha256:)?[a-fA-F0-9]{64}$/;
const MAX_TRANSACTION_PAYLOAD_BYTES = 32 * 1024;

@Info({ title: 'SkillManagerContract', description: 'SynapseNet verifiable credential network' })
export class SkillManagerContract extends Contract {
    constructor() {
        super('SynapseNet.SkillManagerContract');
    }

    public async InitLedger(_ctx: Context): Promise<void> {
        console.info('SynapseNet credential network initialized');
    }

    public async registerUser(ctx: Context, userId: string, displayName: string): Promise<string> {
        const id = this.requireId('userId', userId);
        await this.assertMissing(ctx, 'user', id, `User ${id} already exists`);
        const user: User = {
            ...this.audit(ctx),
            docType: 'user',
            userId: id,
            displayName: this.requireText('displayName', displayName, MAX_NAME_LENGTH),
            status: 'active',
            mspId: ctx.clientIdentity.getMSPID()
        };
        await this.put(ctx, 'user', id, user);
        await this.ensureWallet(ctx, id, 'user');
        this.event(ctx, 'UserRegistered', { userId: id });
        return id;
    }

    public async registerEnterprise(
        ctx: Context,
        enterpriseId: string,
        name: string,
        initialReviewerId: string
    ): Promise<string> {
        const id = this.requireId('enterpriseId', enterpriseId);
        const reviewerId = this.requireId('initialReviewerId', initialReviewerId);
        await this.assertMissing(ctx, 'enterprise', id, `Enterprise ${id} already exists`);
        const enterprise: Enterprise = {
            ...this.audit(ctx),
            docType: 'enterprise',
            enterpriseId: id,
            name: this.requireText('name', name, MAX_NAME_LENGTH),
            reviewers: [reviewerId],
            status: 'active',
            mspId: ctx.clientIdentity.getMSPID()
        };
        await this.put(ctx, 'enterprise', id, enterprise);
        await this.setIssuerEndorsement(ctx, 'enterprise', id, enterprise.mspId);
        await this.ensureWallet(ctx, id, 'enterprise');
        this.event(ctx, 'EnterpriseRegistered', { enterpriseId: id, reviewerId });
        return id;
    }

    public async addEnterpriseReviewer(
        ctx: Context,
        enterpriseId: string,
        reviewerId: string
    ): Promise<void> {
        const enterprise = await this.get<Enterprise>(
            ctx, 'enterprise', this.requireId('enterpriseId', enterpriseId)
        );
        const reviewer = this.requireId('reviewerId', reviewerId);
        if (!enterprise.reviewers.includes(reviewer)) enterprise.reviewers.push(reviewer);
        await this.put(ctx, 'enterprise', enterprise.enterpriseId, enterprise);
        this.event(ctx, 'EnterpriseMemberAdded', {
            enterpriseId: enterprise.enterpriseId,
            reviewerId: reviewer
        });
    }

    public async submitCredentialRequest(ctx: Context, payloadJSON: string): Promise<string> {
        const payload = this.parseObject(payloadJSON);
        const requestId = this.requireId('requestId', String(payload.requestId || ''));
        const userId = this.requireId('userId', String(payload.userId || ''));
        const enterpriseId = this.requireId('enterpriseId', String(payload.enterpriseId || ''));
        const user = await this.get<User>(ctx, 'user', userId);
        const enterprise = await this.get<Enterprise>(ctx, 'enterprise', enterpriseId);
        this.assertBoundMsp(ctx, user.mspId, 'credential holder');
        this.assertCertificateActor(ctx, userId, 'user');
        await this.assertMissing(
            ctx, 'credentialRequest', requestId, `Credential request ${requestId} already exists`
        );
        const credentialType = this.credentialType(payload.credentialType);
        const details = this.objectValue(payload.details, 'details');
        const evidence = this.evidenceList(payload.evidence);
        if (credentialType === 'skill') this.validateSkillDetails(details, evidence);

        const request: CredentialRequest = {
            ...this.audit(ctx),
            docType: 'credentialRequest',
            requestId,
            userId,
            enterpriseId,
            credentialType,
            title: this.requireText('title', String(payload.title || ''), MAX_NAME_LENGTH),
            details,
            evidence,
            status: 'pending_validation'
        };
        await this.put(ctx, 'credentialRequest', requestId, request);
        await this.setIssuerEndorsement(
            ctx, 'credentialRequest', requestId, enterprise.mspId
        );
        this.event(ctx, 'CredentialTransaction', {
            action: 'submit', requestId, credentialId: null, userId, enterpriseId,
            credentialType: request.credentialType, title: request.title,
            status: request.status, timestamp: request.createdAt
        });
        return requestId;
    }

    public async reviewCredentialRequest(
        ctx: Context,
        requestId: string,
        reviewerId: string,
        decision: string,
        notes: string
    ): Promise<string> {
        const request = await this.get<CredentialRequest>(
            ctx, 'credentialRequest', this.requireId('requestId', requestId)
        );
        if (request.status !== 'pending_validation') {
            throw new Error(`Credential request ${request.requestId} has already been reviewed`);
        }
        const reviewer = this.requireId('reviewerId', reviewerId);
        const enterprise = await this.get<Enterprise>(ctx, 'enterprise', request.enterpriseId);
        this.assertBoundMsp(ctx, enterprise.mspId, 'credential issuer');
        this.assertCertificateActor(ctx, reviewer, 'reviewer');
        if (!enterprise.reviewers.includes(reviewer)) {
            throw new Error(`${reviewer} is not an authorized reviewer for ${enterprise.name}`);
        }
        if (decision !== 'approve' && decision !== 'reject') {
            throw new Error('decision must be approve or reject');
        }

        const reviewedAt = this.timestamp(ctx);
        request.status = decision === 'approve' ? 'approved' : 'rejected';
        request.reviewedBy = reviewer;
        request.reviewedAt = reviewedAt;
        request.reviewNotes = String(notes || '').trim().slice(0, MAX_TEXT_LENGTH);
        await this.put(ctx, 'credentialRequest', request.requestId, request);

        if (decision === 'reject') {
            this.event(ctx, 'CredentialTransaction', {
                action: 'review', requestId: request.requestId, credentialId: null,
                userId: request.userId, enterpriseId: request.enterpriseId,
                reviewerId: reviewer, credentialType: request.credentialType,
                title: request.title, status: request.status, timestamp: reviewedAt
            });
            return '';
        }

        const credentialId = `credential-${request.requestId}`;
        const credential: Credential = {
            ...this.audit(ctx),
            docType: 'credential',
            credentialId,
            requestId: request.requestId,
            ownerId: request.userId,
            issuerEnterpriseId: request.enterpriseId,
            credentialType: request.credentialType,
            title: request.title,
            details: request.details,
            evidence: request.evidence,
            approvedBy: reviewer,
            approvedAt: reviewedAt,
            status: 'active'
        };
        await this.put(ctx, 'credential', credentialId, credential);
        await this.setIssuerEndorsement(
            ctx, 'credential', credentialId, enterprise.mspId
        );
        this.event(ctx, 'CredentialTransaction', {
            action: 'review', requestId: request.requestId, credentialId,
            userId: request.userId, enterpriseId: request.enterpriseId,
            reviewerId: reviewer, credentialType: request.credentialType,
            title: request.title, status: request.status, timestamp: reviewedAt
        });
        return credentialId;
    }

    public async createShareGrant(ctx: Context, payloadJSON: string): Promise<string> {
        const payload = this.parseObject(payloadJSON);
        const shareId = this.requireId('shareId', String(payload.shareId || ''));
        const ownerId = this.requireId('ownerId', String(payload.ownerId || ''));
        await this.get<User>(ctx, 'user', ownerId);
        await this.assertMissing(ctx, 'shareGrant', shareId, `Share grant ${shareId} already exists`);
        if (!Array.isArray(payload.credentialIds) || payload.credentialIds.length === 0) {
            throw new Error('At least one credential must be selected');
        }
        const credentialIds = [...new Set(payload.credentialIds.map((value) =>
            this.requireId('credentialId', String(value))
        ))];
        for (const credentialId of credentialIds) {
            const credential = await this.get<Credential>(ctx, 'credential', credentialId);
            if (credential.ownerId !== ownerId || credential.status !== 'active') {
                throw new Error(`Credential ${credentialId} is not shareable by ${ownerId}`);
            }
        }
        const validFrom = this.isoDate('validFrom', payload.validFrom);
        const expiresAt = this.isoDate('expiresAt', payload.expiresAt);
        if (Date.parse(expiresAt) <= Date.parse(validFrom)) {
            throw new Error('expiresAt must be later than validFrom');
        }
        const grant: ShareGrant = {
            ...this.audit(ctx),
            docType: 'shareGrant',
            shareId,
            ownerId,
            credentialIds,
            recipient: this.requireText('recipient', String(payload.recipient || ''), MAX_NAME_LENGTH),
            purpose: this.requireText('purpose', String(payload.purpose || ''), MAX_TEXT_LENGTH),
            validFrom,
            expiresAt,
            status: 'active'
        };
        await this.put(ctx, 'shareGrant', shareId, grant);
        this.event(ctx, 'ShareGrantCreated', { shareId, ownerId, credentialIds });
        return shareId;
    }

    public async revokeShareGrant(ctx: Context, shareId: string, ownerId: string): Promise<void> {
        const grant = await this.get<ShareGrant>(
            ctx, 'shareGrant', this.requireId('shareId', shareId)
        );
        if (grant.ownerId !== this.requireId('ownerId', ownerId)) {
            throw new Error('Only the share owner can revoke this grant');
        }
        grant.status = 'revoked';
        grant.revokedAt = this.timestamp(ctx);
        await this.put(ctx, 'shareGrant', grant.shareId, grant);
        this.event(ctx, 'ShareGrantRevoked', { shareId: grant.shareId, ownerId: grant.ownerId });
    }

    public async getUsers(ctx: Context): Promise<string> {
        return this.queryType(ctx, 'user');
    }

    public async getEnterprises(ctx: Context): Promise<string> {
        return this.queryType(ctx, 'enterprise');
    }

    public async getCredentialRequests(ctx: Context): Promise<string> {
        return this.queryType(ctx, 'credentialRequest');
    }

    public async getWallet(ctx: Context, userId: string): Promise<string> {
        const id = this.requireId('userId', userId);
        const credentials = JSON.parse(await this.queryType(ctx, 'credential')) as Credential[];
        return this.serialize(credentials.filter((credential) => credential.ownerId === id));
    }

    public async openWallet(
        ctx: Context,
        ownerId: string,
        ownerType: string
    ): Promise<string> {
        const id = this.requireId('ownerId', ownerId);
        if (ownerType !== 'user' && ownerType !== 'enterprise') {
            throw new Error('ownerType must be user or enterprise');
        }
        await this.get(ctx, ownerType, id);
        const wallet = await this.ensureWallet(ctx, id, ownerType);
        const credentials = JSON.parse(await this.queryType(ctx, 'credential')) as Credential[];
        if (ownerType === 'user') {
            wallet.ownedCredentialIds = credentials
                .filter((credential) => credential.ownerId === id && credential.status === 'active')
                .map((credential) => credential.credentialId);
        } else {
            wallet.issuedCredentialIds = credentials
                .filter((credential) =>
                    credential.issuerEnterpriseId === id && credential.status === 'active'
                )
                .map((credential) => credential.credentialId);
        }
        await this.put(ctx, 'wallet', id, wallet);
        return wallet.walletId;
    }

    public async getWalletAccount(ctx: Context, ownerId: string): Promise<string> {
        const id = this.requireId('ownerId', ownerId);
        const wallet = await this.get<Wallet>(
            ctx, 'wallet', id
        );
        const credentials = JSON.parse(await this.queryType(ctx, 'credential')) as Credential[];
        wallet.ownedCredentialIds = credentials.filter(
            (item) => item.ownerId === id && item.status === 'active'
        ).map((item) => item.credentialId);
        wallet.issuedCredentialIds = credentials.filter(
            (item) => item.issuerEnterpriseId === id && item.status === 'active'
        ).map((item) => item.credentialId);
        return this.serialize(wallet);
    }

    public async getTokenTransactions(ctx: Context, ownerId: string): Promise<string> {
        const id = this.requireId('ownerId', ownerId);
        const results: TokenTransaction[] = [];
        const iterator = await ctx.stub.getStateByPartialCompositeKey('tokenTransaction', [id]);
        try {
            let result = await iterator.next();
            while (!result.done) {
                results.push(JSON.parse(
                    Buffer.from(result.value.value).toString('utf8')
                ) as TokenTransaction);
                result = await iterator.next();
            }
        } finally {
            await iterator.close();
        }
        return this.serialize(results);
    }

    public async executePenaltyDirective(
        ctx: Context,
        directiveId: string,
        actorId: string,
        ownerId: string,
        burnBasisPointsText: string
    ): Promise<string> {
        const directive = this.requireId('directiveId', directiveId);
        const actor = this.requireId('actorId', actorId);
        const owner = this.requireId('ownerId', ownerId);
        const burnBasisPoints = Number(burnBasisPointsText);
        if (!Number.isSafeInteger(burnBasisPoints) || burnBasisPoints < 1 || burnBasisPoints > 10_000) {
            throw new Error('burnBasisPoints must be an integer from 1 to 10000');
        }
        const executionKey = ctx.stub.createCompositeKey('penaltyExecution', [directive]);
        const existing = await ctx.stub.getState(executionKey);
        if (existing?.length) {
            const execution = JSON.parse(existing.toString()) as PenaltyExecution;
            if (execution.actorId !== actor || execution.ownerId !== owner ||
                execution.burnBasisPoints !== burnBasisPoints) {
                throw new Error('Penalty directive was already executed with different parameters');
            }
            return this.serialize(execution);
        }

        const user = await ctx.stub.getState(ctx.stub.createCompositeKey('user', [owner]));
        if (user?.length) {
            if (owner !== actor) throw new Error('User penalty owner must match the accused actor');
        } else {
            const enterprise = await this.get<Enterprise>(ctx, 'enterprise', owner);
            if (owner !== actor && !enterprise.reviewers.includes(actor)) {
                throw new Error('Actor is not associated with the penalty wallet owner');
            }
        }
        const wallet = await this.get<Wallet>(ctx, 'wallet', owner);
        const amount = Math.min(
            wallet.tokenAvailable,
            Math.ceil(wallet.tokenAvailable * burnBasisPoints / 10_000)
        );
        wallet.tokenBurnt += amount;
        wallet.tokenAvailable -= amount;
        wallet.tokenBalance = wallet.tokenAvailable;
        await this.put(ctx, 'wallet', owner, wallet);

        const tokenTransactionId = `penalty-${directive}`;
        const transaction: TokenTransaction = {
            ...this.audit(ctx),
            docType: 'tokenTransaction',
            transactionId: tokenTransactionId,
            walletId: wallet.walletId,
            ownerId: owner,
            transactionType: 'burnt',
            amount,
            balanceAfter: wallet.tokenAvailable,
            description: `Finalized misconduct penalty ${directive}`,
            referenceId: directive
        };
        await ctx.stub.putState(
            ctx.stub.createCompositeKey('tokenTransaction', [owner, tokenTransactionId]),
            this.toBuffer(transaction)
        );
        const execution: PenaltyExecution = {
            ...this.audit(ctx),
            docType: 'penaltyExecution',
            directiveId: directive,
            actorId: actor,
            ownerId: owner,
            burnBasisPoints,
            amount,
            balanceAfter: wallet.tokenAvailable,
            tokenTransactionId
        };
        await ctx.stub.putState(executionKey, this.toBuffer(execution));
        this.event(ctx, 'PenaltyExecuted', execution);
        return this.serialize(execution);
    }

    public async getIssuedCredentials(ctx: Context, enterpriseId: string): Promise<string> {
        const id = this.requireId('enterpriseId', enterpriseId);
        const credentials = JSON.parse(await this.queryType(ctx, 'credential')) as Credential[];
        return this.serialize(credentials.filter(
            (credential) => credential.issuerEnterpriseId === id
        ));
    }

    public async getShareGrant(ctx: Context, shareId: string): Promise<string> {
        const grant = await this.get<ShareGrant>(
            ctx, 'shareGrant', this.requireId('shareId', shareId)
        );
        const credentials: Credential[] = [];
        for (const credentialId of grant.credentialIds) {
            credentials.push(await this.get<Credential>(ctx, 'credential', credentialId));
        }
        return this.serialize({
            grant,
            credentials,
            accessible: grant.status === 'active'
                && Date.now() >= Date.parse(grant.validFrom)
                && Date.now() <= Date.parse(grant.expiresAt)
        });
    }

    public async getSharedCredentials(ctx: Context, recipientId: string): Promise<string> {
        const recipient = this.requireId('recipientId', recipientId);
        const grants = JSON.parse(await this.queryType(ctx, 'shareGrant')) as ShareGrant[];
        const now = Number(ctx.stub.getTxTimestamp().seconds.toString()) * 1_000;
        const shared = [];
        for (const grant of grants.filter((item) => item.recipient === recipient)) {
            const credentials: Credential[] = [];
            for (const credentialId of grant.credentialIds) {
                credentials.push(await this.get<Credential>(ctx, 'credential', credentialId));
            }
            shared.push({
                grant,
                credentials,
                accessible: grant.status === 'active'
                    && now >= Date.parse(grant.validFrom)
                    && now <= Date.parse(grant.expiresAt)
            });
        }
        return this.serialize(shared);
    }

    private audit(ctx: Context): Pick<LedgerRecord, 'createdAt' | 'submittedBy' | 'transactionId'> {
        return {
            createdAt: this.timestamp(ctx),
            submittedBy: ctx.clientIdentity.getID(),
            transactionId: ctx.stub.getTxID()
        };
    }

    private timestamp(ctx: Context): string {
        return ctx.stub.getTxTimestamp().seconds.toString();
    }

    private async queryType(ctx: Context, type: string): Promise<string> {
        const results: unknown[] = [];
        const iterator = await ctx.stub.getStateByPartialCompositeKey(type, []);
        try {
            let result = await iterator.next();
            while (!result.done) {
                results.push(JSON.parse(Buffer.from(result.value.value).toString('utf8')));
                result = await iterator.next();
            }
        } finally {
            await iterator.close();
        }
        return this.serialize(results);
    }

    private async ensureWallet(
        ctx: Context,
        ownerId: string,
        ownerType: 'user' | 'enterprise'
    ): Promise<Wallet> {
        const key = ctx.stub.createCompositeKey('wallet', [ownerId]);
        const existing = await ctx.stub.getState(key);
        if (existing?.length) {
            const wallet = JSON.parse(Buffer.from(existing).toString('utf8')) as Wallet;
            if (wallet.tokenIssued === undefined) {
                wallet.tokenIssued = wallet.tokenBalance;
                wallet.tokenUsed = 0;
                wallet.tokenBurnt = 0;
                wallet.tokenAvailable = wallet.tokenBalance;
                await ctx.stub.putState(key, this.toBuffer(wallet));
                await this.recordInitialTokens(ctx, wallet);
            }
            return wallet;
        }
        const wallet: Wallet = {
            ...this.audit(ctx),
            docType: 'wallet',
            walletId: `wallet-${ownerType}-${ownerId}`,
            ownerId,
            ownerType,
            ownedCredentialIds: [],
            issuedCredentialIds: [],
            tokenSymbol: 'SNT',
            tokenBalance: 1_000,
            tokenIssued: 1_000,
            tokenUsed: 0,
            tokenBurnt: 0,
            tokenAvailable: 1_000
        };
        await ctx.stub.putState(key, this.toBuffer(wallet));
        await this.recordInitialTokens(ctx, wallet);
        this.event(ctx, 'WalletOpened', {
            walletId: wallet.walletId,
            ownerId,
            ownerType
        });
        this.event(ctx, 'DummyTokensAllocated', {
            walletId: wallet.walletId,
            amount: wallet.tokenBalance,
            symbol: wallet.tokenSymbol
        });
        return wallet;
    }

    private async recordInitialTokens(ctx: Context, wallet: Wallet): Promise<void> {
        const transactionId = `initial-allocation-${wallet.ownerId}`;
        const key = ctx.stub.createCompositeKey(
            'tokenTransaction',
            [wallet.ownerId, transactionId]
        );
        const existing = await ctx.stub.getState(key);
        if (existing?.length) return;
        const transaction: TokenTransaction = {
            ...this.audit(ctx),
            docType: 'tokenTransaction',
            transactionId,
            walletId: wallet.walletId,
            ownerId: wallet.ownerId,
            transactionType: 'issued',
            amount: wallet.tokenIssued,
            balanceAfter: wallet.tokenAvailable,
            description: 'Initial dummy SNT allocation'
        };
        await ctx.stub.putState(key, this.toBuffer(transaction));
    }

    private async get<T>(ctx: Context, type: string, id: string): Promise<T> {
        const value = await ctx.stub.getState(ctx.stub.createCompositeKey(type, [id]));
        if (!value?.length) throw new Error(`${type} ${id} does not exist`);
        return JSON.parse(Buffer.from(value).toString('utf8')) as T;
    }

    private async put(ctx: Context, type: string, id: string, value: unknown): Promise<void> {
        await ctx.stub.putState(ctx.stub.createCompositeKey(type, [id]), this.toBuffer(value));
    }

    private async setIssuerEndorsement(
        ctx: Context, type: string, id: string, issuerMspId?: string
    ): Promise<void> {
        const mspId = issuerMspId || ctx.clientIdentity.getMSPID();
        const policy = new KeyEndorsementPolicy();
        policy.addOrgs('PEER', mspId);
        await ctx.stub.setStateValidationParameter(
            ctx.stub.createCompositeKey(type, [id]), policy.getPolicy()
        );
    }

    private assertCertificateActor(ctx: Context, actorId: string, requiredRole: string): void {
        const identity = ctx.clientIdentity as any;
        const certificateActor = identity.getAttributeValue?.('synapsenet.actorId');
        const certificateRole = identity.getAttributeValue?.('synapsenet.role');
        if (certificateActor === null || certificateActor === undefined) {
            // Development Org1 certificates predate attributed actor enrollment.
            if (ctx.clientIdentity.getMSPID() === 'Org1MSP') return;
            throw new Error('Submitting certificate is missing synapsenet.actorId');
        }
        if (certificateActor !== actorId || certificateRole !== requiredRole) {
            throw new Error(`Submitting certificate is not authorized as ${requiredRole} ${actorId}`);
        }
    }

    private async assertMissing(
        ctx: Context, type: string, id: string, message: string
    ): Promise<void> {
        const value = await ctx.stub.getState(ctx.stub.createCompositeKey(type, [id]));
        if (value?.length) throw new Error(message);
    }

    private event(ctx: Context, name: string, payload: unknown): void {
        ctx.stub.setEvent(name, this.toBuffer(payload));
    }

    private requireId(field: string, value: string): string {
        const normalized = this.requireText(field, value, MAX_ID_LENGTH);
        if (!ID_PATTERN.test(normalized)) {
            throw new Error(`${field} contains unsupported characters`);
        }
        return normalized;
    }

    private requireText(field: string, value: string, maximumLength: number): string {
        const normalized = value?.trim();
        if (!normalized) throw new Error(`${field} is required`);
        if (normalized.length > maximumLength) {
            throw new Error(`${field} must not exceed ${maximumLength} characters`);
        }
        return normalized;
    }

    private parseObject(value: string): Record<string, any> {
        if (Buffer.byteLength(value, 'utf8') > MAX_TRANSACTION_PAYLOAD_BYTES) {
            throw new Error(`payload must not exceed ${MAX_TRANSACTION_PAYLOAD_BYTES} bytes`);
        }
        try {
            return this.objectValue(JSON.parse(value), 'payload');
        } catch (error) {
            if (error instanceof SyntaxError) throw new Error('payload must be valid JSON');
            throw error;
        }
    }

    private objectValue(value: unknown, field: string): Record<string, any> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`${field} must be an object`);
        }
        return value as Record<string, any>;
    }

    private credentialType(value: unknown): CredentialType {
        const type = String(value || '') as CredentialType;
        if (!['skill', 'role', 'education', 'certificate', 'other'].includes(type)) {
            throw new Error('credentialType is invalid');
        }
        return type;
    }

    private evidenceList(value: unknown): Evidence[] {
        if (!Array.isArray(value)) throw new Error('evidence must be an array');
        return value.map((item, index) => {
            const evidence = this.objectValue(item, `evidence[${index}]`);
            const contentHash = String(evidence.contentHash || '').trim();
            if (!SHA256_PATTERN.test(contentHash)) {
                throw new Error(`evidence[${index}].contentHash must be a SHA-256 hash`);
            }
            return {
                evidenceId: this.requireId(
                    `evidence[${index}].evidenceId`, String(evidence.evidenceId || '')
                ),
                documentType: this.requireText(
                    `evidence[${index}].documentType`,
                    String(evidence.documentType || ''),
                    MAX_NAME_LENGTH
                ),
                fileName: this.requireText(
                    `evidence[${index}].fileName`, String(evidence.fileName || ''), MAX_NAME_LENGTH
                ),
                contentHash: contentHash.toLowerCase().replace(/^sha256:/, 'sha256:'),
                hashAlgorithm: 'SHA-256',
                storageProvider: this.requireText(
                    `evidence[${index}].storageProvider`,
                    String(evidence.storageProvider || ''),
                    MAX_NAME_LENGTH
                ),
                storageReference: String(evidence.storageReference || '').trim().slice(0, 500)
            };
        });
    }

    private validateSkillDetails(details: Record<string, any>, evidence: Evidence[]): void {
        if (!['Beginner', 'Intermediate', 'Advanced', 'Expert'].includes(
            String(details.proficiencyLevel || '')
        )) throw new Error('skill proficiencyLevel is invalid');
        this.requireText(
            'skill practicalApplication', String(details.practicalApplication || ''), MAX_TEXT_LENGTH
        );
        if (details.yearsExperience !== undefined) {
            const years = Number(details.yearsExperience);
            if (!Number.isFinite(years) || years < 0 || years > 80) {
                throw new Error('skill yearsExperience must be between 0 and 80');
            }
        }
        this.stringList(details.tools, 'skill tools', 30, 100);
        this.stringList(details.attestations, 'skill attestations', 20, MAX_NAME_LENGTH);
        if (details.lastUsed && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(details.lastUsed))) {
            throw new Error('skill lastUsed must use YYYY-MM');
        }
        const allowed = new Set([
            'Assessment Score', 'Code Repository', 'Work Deliverable',
            'Certificate', 'Performance Review', 'Other'
        ]);
        if (evidence.some((item) => !allowed.has(item.documentType))) {
            throw new Error('skill evidence documentType is invalid');
        }
    }

    private stringList(value: unknown, field: string, maximum: number, length: number): void {
        if (!Array.isArray(value) || value.length > maximum) {
            throw new Error(`${field} must be an array with at most ${maximum} items`);
        }
        value.forEach((item, index) => this.requireText(`${field}[${index}]`, String(item), length));
    }

    private isoDate(field: string, value: unknown): string {
        const text = String(value || '');
        if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${field} must be an ISO date`);
        return new Date(text).toISOString();
    }

    private serialize(value: unknown): string {
        return stringify(sortKeysRecursive(value as never));
    }

    private toBuffer(value: unknown): Buffer {
        return Buffer.from(this.serialize(value));
    }

    private assertBoundMsp(ctx: Context, mspId: string | undefined, subject: string): void {
        // Records created before MSP binding was introduced remain readable during migration.
        if (mspId && ctx.clientIdentity.getMSPID() !== mspId) {
            throw new Error(`Submitting MSP is not authorized for this ${subject}`);
        }
    }
}
