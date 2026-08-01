import axios from 'axios';
import { z } from 'zod';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  withCredentials: true,
  headers: { Accept: 'application/json' }
});

const businessApi = axios.create({
  baseURL: import.meta.env.DEV ? '/legacy-api' : '/api',
  withCredentials: true,
  headers: { Accept: 'application/json' }
});

const credentialShareSchema = z.object({
  grant: z.object({
    shareId: z.string(),
    ownerId: z.string(),
    credentialIds: z.array(z.string()),
    recipient: z.string(),
    purpose: z.string(),
    validFrom: z.string(),
    expiresAt: z.string(),
    status: z.string()
  }),
  credentials: z.array(z.record(z.string(), z.unknown())),
  accessible: z.boolean()
});

const walletSchema = z.object({
  wallet: z.object({
    walletId: z.string(),
    tokenIssued: z.number(),
    tokenUsed: z.number(),
    tokenBurnt: z.number(),
    tokenAvailable: z.number()
  }),
  credentialSummary: z.object({
    total: z.number(),
    approved: z.number(),
    pending: z.number(),
    rejected: z.number()
  }),
  credentials: z.array(z.record(z.string(), z.unknown())),
  credentialRequests: z.array(z.record(z.string(), z.unknown())),
  sharedCredentials: z.array(credentialShareSchema),
  tokenTransactions: z.array(z.record(z.string(), z.unknown()))
});

export type WalletPayload = z.infer<typeof walletSchema>;

const credentialTransactionSchema = z.object({
  transactionHash: z.string(),
  blockNumber: z.string(),
  validationStatus: z.string(),
  action: z.enum(['submit', 'review']),
  requestId: z.string(),
  credentialId: z.string().nullable().optional(),
  method: z.string(),
  status: z.string(),
  timestamp: z.string(),
  from: z.string(),
  to: z.string(),
  title: z.string()
});

const transactionPageSchema = z.object({
  items: z.array(credentialTransactionSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  indexing: z.object({ ready: z.boolean(), error: z.string().nullable() })
});

export type CredentialTransaction = z.infer<typeof credentialTransactionSchema>;

export async function getTransactions(status?: string) {
  return transactionPageSchema.parse((await api.get('/v2/transactions', {
    params: { status, pageSize: 100 }
  })).data);
}

export async function getWallet(): Promise<WalletPayload> {
  return walletSchema.parse((await api.get('/wallet')).data);
}

export async function walletChallenge(address: string): Promise<string> {
  const response = await api.post('/v2/auth/wallet/challenge', { address });
  return z.object({ message: z.string() }).parse(response.data).message;
}

export async function verifyWallet(address: string, signature: string): Promise<void> {
  await api.post('/v2/auth/wallet/verify', { address, signature });
}

export type LegacyActor = {
  actorId: string;
  role: 'user' | 'reviewer';
  displayName?: string;
  enterpriseId?: string;
};

export async function migrationContext(): Promise<LegacyActor | null> {
  const response = await api.get('/v2/migration/context');
  return z.object({
    actor: z.object({
      actorId: z.string(),
      role: z.enum(['user', 'reviewer']),
      enterpriseId: z.string().optional()
    }).nullable()
  }).parse(response.data).actor;
}

export async function businessSession(): Promise<LegacyActor | null> {
  const response = await businessApi.get('/session');
  return z.object({
    actor: z.object({
      actorId: z.string(),
      role: z.enum(['user', 'reviewer']),
      displayName: z.string().optional(),
      enterpriseId: z.string().optional()
    }).nullable()
  }).parse(response.data).actor;
}

export async function loginBusiness(actorId: string, password: string): Promise<LegacyActor> {
  const response = await businessApi.post('/login', { actorId, password });
  return z.object({
    actor: z.object({
      actorId: z.string(),
      role: z.enum(['user', 'reviewer']),
      displayName: z.string().optional(),
      enterpriseId: z.string().optional()
    })
  }).parse(response.data).actor;
}

export async function logoutBusiness(): Promise<void> {
  await businessApi.post('/logout');
}

export async function registerProfessional(payload: {
  userId: string;
  displayName: string;
  password: string;
}): Promise<void> {
  await businessApi.post('/users', payload);
}

export async function businessBootstrap(): Promise<{
  enterprises: Array<{ enterpriseId: string; name: string }>;
  directory: Array<{ userId: string; displayName: string }>;
  credentialRequests: Array<Record<string, unknown>>;
}> {
  return (await businessApi.get('/bootstrap')).data;
}

export async function submitCredentialRequest(payload: Record<string, unknown>): Promise<string> {
  return z.object({ requestId: z.string() })
    .parse((await businessApi.post('/credential-requests', payload)).data).requestId;
}

export async function reviewCredentialRequest(
  requestId: string,
  decision: 'approve' | 'reject',
  notes: string
): Promise<void> {
  await businessApi.post(`/credential-requests/${encodeURIComponent(requestId)}/review`, {
    decision,
    notes
  });
}

export async function createCredentialShare(payload: {
  credentialIds: string[];
  recipient: string;
  purpose: string;
  validFrom: string;
  expiresAt: string;
}): Promise<{ shareId: string; shareUrl: string; qrDataUrl: string }> {
  return z.object({
    shareId: z.string(),
    shareUrl: z.string(),
    qrDataUrl: z.string()
  }).parse((await businessApi.post('/shares', payload)).data);
}

export type CredentialShare = z.infer<typeof credentialShareSchema>;

export async function getCredentialShare(shareId: string): Promise<CredentialShare> {
  return credentialShareSchema.parse(
    (await businessApi.get(`/shares/${encodeURIComponent(shareId)}`)).data
  );
}

export async function linkWallet(
  intent: Record<string, unknown>,
  signature: string
): Promise<void> {
  await api.post('/v2/wallet/link', { intent, signature });
}

export async function applyForOrganization(payload: {
  legalName: string;
  displayName: string;
  jurisdiction: string;
  registrationNumber: string;
  requestedMspId: string;
}): Promise<{ applicationId: string; status: string }> {
  const response = await api.post('/v2/organizations/applications', payload);
  return z.object({ applicationId: z.string(), status: z.string() }).parse(response.data);
}

export async function reportIncident(payload: {
  incidentId: string;
  accusedActorId: string;
  credentialId?: string;
  allegationHash: string;
  intent: Record<string, unknown>;
  signature: string;
}): Promise<{ incidentId: string }> {
  const response = await api.post('/v2/incidents', payload);
  return z.object({ incidentId: z.string() }).parse(response.data);
}

export async function appealIncident(
  incidentId: string,
  payload: { intent: Record<string, unknown>; signature: string }
): Promise<void> {
  await api.post(`/v2/incidents/${encodeURIComponent(incidentId)}/appeal`, payload);
}
