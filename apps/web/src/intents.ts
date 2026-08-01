export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('')}`;
}

export async function personalSign(message: string, walletAddress: string): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask is not installed in this browser.');
  const encodedMessage = `0x${[...new TextEncoder().encode(message)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
  return window.ethereum.request<string>({
    method: 'personal_sign',
    params: [encodedMessage, walletAddress]
  });
}

export async function signIntent(
  action: string,
  actorId: string,
  walletAddress: string,
  payload: Record<string, unknown>
) {
  if (!window.ethereum) throw new Error('MetaMask is not installed in this browser.');
  const intent = {
    domain: 'SynapseNet',
    version: '1',
    action,
    actorId,
    walletAddress,
    payloadHash: await sha256(stableJson(payload)),
    nonce: crypto.randomUUID(),
    expiresAt: Math.floor(Date.now() / 1000) + 300
  };
  const signature = await personalSign(stableJson(intent), walletAddress);
  return { intent, signature };
}
