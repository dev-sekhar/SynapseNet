export type ParticipantType = 'user' | 'enterprise' | 'reviewer';
export type ParticipantStatus = 'active' | 'probation' | 'suspended';
export type IncidentStatus =
    'reported' | 'investigating' | 'confirmed' | 'dismissed' | 'appealed' |
    'final' | 'issuer_unresponsive';

export interface Policy {
    docType: 'trustPolicy';
    version: string;
    governanceMspIds: string[];
    penaltyBurnBasisPoints: number[];
    reputationRewards: Record<string, number>;
    reputationPenalties: Record<string, number>;
    incidentResponseSeconds: number;
    appealSeconds: number;
    effectiveAt: string;
}

export interface Participant {
    docType: 'trustParticipant';
    actorId: string;
    actorType: ParticipantType;
    walletAddress: string;
    authoritativeMspId: string;
    reputation: number;
    confirmedIncidents: number;
    status: ParticipantStatus;
    createdAt: string;
}

export interface SignedIntent {
    domain: 'SynapseNet';
    version: '1';
    action: string;
    actorId: string;
    walletAddress: string;
    payloadHash: string;
    nonce: string;
    expiresAt: number;
}

export interface Incident {
    docType: 'misconductIncident';
    incidentId: string;
    accusedActorId: string;
    reporterActorId: string;
    credentialId?: string;
    allegationHash: string;
    status: IncidentStatus;
    policyVersion: string;
    createdAt: string;
    responseDueAt: number;
    issuerResponseHash?: string;
    decidedAt?: string;
    appealDueAt?: number;
    decisionReasonHash?: string;
    finalDecision?: 'confirmed' | 'dismissed';
    appealUsed: boolean;
}

export interface CredentialTrustProjection {
    docType: 'credentialTrustProjection';
    credentialId: string;
    status: 'challenged' | 'issuer_unresponsive' | 'trusted' | 'invalidated';
    incidentId: string;
    updatedAt: string;
}

export interface PenaltyDirective {
    docType: 'penaltyDirective';
    directiveId: string;
    incidentId: string;
    actorId: string;
    burnBasisPoints: number;
    incidentNumber: number;
    policyVersion: string;
    status: 'pending_token_execution';
    createdAt: string;
}
