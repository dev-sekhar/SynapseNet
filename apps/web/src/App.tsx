import {
  AccountBalanceWalletOutlined,
  AddRounded,
  BoltRounded,
  CheckCircleRounded,
  ContentCopyRounded,
  HubRounded,
  QrCode2Rounded,
  ShieldOutlined
} from '@mui/icons-material';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogContent,
  Divider,
  Grid,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  authenticatedWallet, getWallet, LegacyActor, linkWallet, logoutBusiness, logoutWallet,
  verifyWallet, walletChallenge
} from './api';
import { BusinessAction, BusinessActions } from './BusinessActions';
import { useWalletStore } from './store';
import { OrganizationOnboarding } from './OrganizationOnboarding';
import { TrustDisputes } from './TrustDisputes';
import { personalSign, signIntent } from './intents';
import { SharedCredentials } from './SharedCredentials';
import { TransactionScan } from './TransactionScan';
import { ModalTitle } from './ModalTitle';
import { LatestTransactions } from './LatestTransactions';

const emptyWallet = {
  wallet: { walletId: 'Connect to load', tokenIssued: 0, tokenUsed: 0, tokenBurnt: 0, tokenAvailable: 0 },
  credentialSummary: { total: 0, approved: 0, pending: 0, rejected: 0 },
  credentials: [],
  credentialRequests: [],
  sharedCredentials: [],
  tokenTransactions: []
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function errorDetail(reason: unknown) {
  const error = reason as {
    response?: { data?: { detail?: string } };
    message?: string;
  };
  return error.response?.data?.detail || error.message || String(reason);
}

export function App() {
  const { address, connected, setWallet, disconnect } = useWalletStore();
  const [dialog, setDialog] = useState<'credentials' | 'tokens' | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [businessActor, setBusinessActor] = useState<LegacyActor | null>(null);
  const [businessAction, setBusinessAction] = useState<BusinessAction>(null);
  const [shareId, setShareId] = useState(
    () => new URLSearchParams(window.location.search).get('share')
  );
  const walletQuery = useQuery({
    queryKey: ['wallet', address],
    queryFn: getWallet,
    enabled: connected && businessActor !== null
  });
  const data = walletQuery.data ?? emptyWallet;

  function openTransactionScan(status?: string) {
    setTransactionStatus(status);
    setDialog('credentials');
  }

  useEffect(() => {
    void authenticatedWallet().then(({ address: verifiedAddress, actor }) => {
      setWallet(verifiedAddress);
      setBusinessActor(actor);
    }).catch(() => {
      setBusinessActor(null);
      disconnect();
    });
  }, [disconnect, setWallet]);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;
    const onAccountsChanged = (accounts: unknown) => {
      const values = Array.isArray(accounts) ? accounts : [];
      if (values.length === 0) {
        disconnect();
        setError('MetaMask account access was removed. Reconnect your wallet to continue.');
      } else if (connected && typeof values[0] === 'string' &&
        values[0].toLowerCase() !== address?.toLowerCase()) {
        disconnect();
        setBusinessActor(null);
        setError(
          'MetaMask account changed. Click Connect MetaMask to verify the newly selected account before continuing.'
        );
      }
    };
    const onDisconnect = () => {
      disconnect();
      setReloadRequired(true);
      setError('MetaMask lost its browser-extension connection. Reload this page, unlock MetaMask, then connect again.');
    };
    provider.on('accountsChanged', onAccountsChanged);
    provider.on('disconnect', onDisconnect);
    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged);
      provider.removeListener?.('disconnect', onDisconnect);
    };
  }, [address, connected, disconnect]);

  async function linkBusinessIdentity(actor: LegacyActor, walletAddress: string) {
    const payload = {
      actorId: actor.actorId,
      actorType: actor.role === 'reviewer' ? 'reviewer' : 'user',
      authoritativeMspId: 'Org1MSP',
      walletAddress: walletAddress.toLowerCase()
    };
    const signed = await signIntent('registerParticipant', actor.actorId, walletAddress, payload);
    await linkWallet(signed.intent, signed.signature);
  }

  async function authenticated(actor: LegacyActor) {
    if (!address) throw new Error('Connect MetaMask before linking a business profile.');
    await linkBusinessIdentity(actor, address);
    setBusinessActor(actor);
    await walletQuery.refetch();
  }

  async function signOutBusiness() {
    await Promise.allSettled([logoutBusiness(), logoutWallet()]);
    setBusinessActor(null);
    await disconnectWallet();
    window.location.assign('/');
  }

  async function disconnectWallet() {
    try {
      await window.ethereum?.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }]
      });
    } catch {
      // Providers without permission revocation still need local state cleared.
    } finally {
      disconnect();
    }
  }

  function closeSharedCredentials() {
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setShareId(null);
  }

  async function connect() {
    setError(null);
    setReloadRequired(false);
    setDiagnostics(null);
    let stage = 'account permission';
    const trace: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      origin: window.location.origin,
      userAgent: navigator.userAgent,
      providerDetected: Boolean(window.ethereum),
      providerIsMetaMask: window.ethereum?.isMetaMask === true
    };
    try {
      if (!window.ethereum) throw new Error('MetaMask is not installed in this browser.');
      trace.chainId = await window.ethereum.request<string>({ method: 'eth_chainId' });
      await window.ethereum.request<string[]>({ method: 'eth_requestAccounts' });
      let permissions = await window.ethereum.request<Array<{ parentCapability?: string }>>({
        method: 'wallet_getPermissions'
      });
      trace.initialPermissions = permissions.map((permission) => permission.parentCapability ?? 'unknown');
      if (!permissions.some((permission) => permission.parentCapability === 'eth_accounts')) {
        stage = 'explicit account permission';
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        });
        permissions = await window.ethereum.request<Array<{ parentCapability?: string }>>({
          method: 'wallet_getPermissions'
        });
      }
      const accounts = await window.ethereum.request<string[]>({ method: 'eth_accounts' });
      const selected = accounts[0];
      trace.permissions = permissions.map((permission) => permission.parentCapability ?? 'unknown');
      trace.authorizedAccounts = accounts;
      if (!permissions.some((permission) => permission.parentCapability === 'eth_accounts')) {
        throw Object.assign(new Error('MetaMask did not persist the requested account permission.'), { code: 4100 });
      }
      if (!selected) throw new Error('MetaMask did not return an account. Unlock MetaMask and approve account access.');
      stage = 'identity challenge signature';
      const message = await walletChallenge(selected);
      trace.signatureRequest = {
        method: 'personal_sign',
        account: selected,
        encoding: '0x-prefixed UTF-8',
        messageCharacters: message.length,
        messageBytes: new TextEncoder().encode(message).length
      };
      const signature = await personalSign(message, selected);
      trace.identitySignatureCompleted = true;
      await verifyWallet(selected, signature);
      trace.backendVerificationCompleted = true;
      setWallet(selected);
      stage = 'wallet actor lookup';
      const authenticated = await authenticatedWallet();
      trace.walletActor = authenticated.actor.actorId;
      setBusinessActor(authenticated.actor);
    } catch (reason) {
      const walletError = reason as { code?: number; message?: string; data?: unknown };
      const detail = errorDetail(reason);
      trace.failedStage = stage;
      trace.error = {
        code: walletError.code ?? null,
        message: walletError.message ?? String(reason),
        backendDetail: detail,
        dataType: walletError.data === undefined ? 'absent' : typeof walletError.data
      };
      const report = JSON.stringify(trace, null, 2);
      setDiagnostics(report);
      console.error('SynapseNet wallet diagnostic', trace);
      if (walletError.code === 4900 || /disconnected from metamask background/i.test(walletError.message ?? '')) {
        disconnect();
        setReloadRequired(true);
        setError('MetaMask lost its browser-extension connection. Reload this page, unlock MetaMask, then connect again.');
      } else if (walletError.code === 4001) {
        setError('The MetaMask request was cancelled. Click Connect MetaMask when you are ready.');
      } else if (walletError.code === 4100) {
        disconnect();
        setError(`MetaMask did not authorize the ${stage}. Open MetaMask → Connected sites, disconnect localhost:3001, then click Connect MetaMask and approve the account and signature prompts.`);
      } else {
        setError(detail || 'Wallet connection failed.');
      }
    }
  }

  return (
    <Box className="app-shell">
      <AppBar position="sticky" color="transparent" elevation={0} className="topbar">
        <Toolbar>
          <Stack direction="row" alignItems="center" spacing={1.4} sx={{ flexGrow: 1 }}>
            <Avatar className="brand-mark"><HubRounded /></Avatar>
            <Box><Typography fontWeight={850}>SynapseNet</Typography><Typography variant="caption" color="text.secondary">Credential protocol</Typography></Box>
          </Stack>
          {connected && businessActor && <Box sx={{ ml: 1 }}>
            <Stack alignItems="flex-start" spacing={0}>
              <Typography variant="body2" fontWeight={800} lineHeight={1.2}>
                {businessActor.displayName || businessActor.actorId}
              </Typography>
              <Typography variant="caption" color="success.main" lineHeight={1.2}>
                Wallet verified · {address ? shortAddress(address) : ''}
              </Typography>
            </Stack>
          </Box>}
          <Button sx={{ ml: 2 }} variant={connected ? 'outlined' : 'contained'} onClick={connected ? disconnectWallet : connect} startIcon={<AccountBalanceWalletOutlined />}>
            {connected ? 'Disconnect' : 'Connect MetaMask'}
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ py: { xs: 3, md: 5 }, px: { xs: 2, sm: 3, lg: 5 } }}>
        {error && <Alert
          severity="error"
          sx={{ mb: 3 }}
          onClose={() => setError(null)}
          action={<Stack direction="row">
            {diagnostics && <Button color="inherit" size="small" onClick={() => setDiagnosticsOpen(true)}>Diagnostics</Button>}
            {reloadRequired && <Button color="inherit" size="small" onClick={() => window.location.reload()}>Reload page</Button>}
          </Stack>}
        >{error}</Alert>}
        {businessActor && !connected && <Alert severity="info" sx={{ mb: 3 }}
          action={<Button color="inherit" size="small" onClick={() => void signOutBusiness()}>Cancel</Button>}>
          Signed in as {businessActor.displayName || businessActor.actorId}. Connect MetaMask to continue, or cancel to return to the landing page.
        </Alert>}
        {walletQuery.isError && businessActor && <Alert severity="error" sx={{ mb: 3 }}>
          Your business session could not load its wallet. Sign in again if the session expired.
        </Alert>}
        <Grid container spacing={4} alignItems="end" className="hero">
          <Grid size={12}>
            <Chip icon={<ShieldOutlined />} label="User-controlled identity" className="protocol-chip" />
            <Typography variant="h1" sx={{ mt: 2, fontSize: { xs: '2.5rem', md: 'clamp(3rem, 4vw, 4rem)' }, whiteSpace: { md: 'nowrap' } }}>
              Your verified career, <span>under your control.</span>
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 2, fontSize: '1.08rem', whiteSpace: { lg: 'nowrap' } }}>
              Own verified skills, roles, and certificates. Authorize every action from your wallet and disclose only what you choose.
            </Typography>
          </Grid>
        </Grid>

        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'end' }} sx={{ mt: 5, mb: 2 }}>
          <Box><Typography variant="overline" color="secondary">Portfolio</Typography><Typography variant="h2">Your wallets</Typography></Box>
          <Button variant="contained" startIcon={<AddRounded />} disabled={!connected}
            onClick={() => setBusinessAction('submit')}>Submit evidence</Button>
        </Stack>

        <Grid container spacing={3} alignItems="stretch">
          <Grid size={{ xs: 12, lg: 8 }}>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
                <Card className="wallet-card credential-card">
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1.3}>
                    <Avatar><CheckCircleRounded /></Avatar>
                    <Typography variant="h6">Credential wallet</Typography>
                  </Stack>
                  <Box component="button" className="scan-stat scan-stat-primary" onClick={() => openTransactionScan('approved')}>
                    <Typography variant="h2" sx={{ mt: 4 }}>{data.credentialSummary.approved}</Typography>
                    <Typography color="text.secondary">approved credentials</Typography>
                  </Box>
                  <Divider sx={{ my: 3 }} />
                  <Grid container spacing={2}>
                    {[['Pending', data.credentialSummary.pending, 'pending_validation'], ['Rejected', data.credentialSummary.rejected, 'rejected'], ['Total', data.credentialSummary.total, undefined]].map(([label, value, status]) =>
                      <Grid size={4} key={String(label)}><Box component="button" className="scan-stat" onClick={() => openTransactionScan(status as string | undefined)}><Typography variant="h6">{value}</Typography><Typography variant="caption" color="text.secondary">{label}</Typography></Box></Grid>)}
                  </Grid>
                  <Button size="small" sx={{ mt: 2 }} onClick={() => businessActor?.role === 'reviewer' ? setBusinessAction('validate') : setBusinessAction('own')}>Open credential wallet</Button>
                </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
                <Card className="wallet-card token-card">
                  <CardActionArea onClick={() => setDialog('tokens')}>
                    <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1.3}>
                    <Avatar><BoltRounded /></Avatar>
                    <Typography variant="h6">SNT utility wallet</Typography>
                  </Stack>
                  <Typography variant="h2" sx={{ mt: 4 }}>{data.wallet.tokenAvailable.toLocaleString()}</Typography>
                  <Typography color="text.secondary">tokens available</Typography>
                  <Divider sx={{ my: 3 }} />
                  <Grid container spacing={2}>
                    {[['Issued', data.wallet.tokenIssued], ['Used', data.wallet.tokenUsed], ['Burnt', data.wallet.tokenBurnt]].map(([label, value]) =>
                      <Grid size={4} key={String(label)}><Typography variant="h6">{value}</Typography><Typography variant="caption" color="text.secondary">{label}</Typography></Grid>)}
                  </Grid>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            </Grid>

            <Card sx={{ mt: 3 }}><CardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }}>
                <Avatar className="qr-icon"><QrCode2Rounded /></Avatar>
                <Box sx={{ flex: 1 }}><Typography variant="h5">Selective credential sharing</Typography><Typography color="text.secondary">Choose credentials, recipient, purpose, and expiry. The QR reveals nothing outside the grant.</Typography></Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="outlined" disabled={!connected || businessActor?.role === 'reviewer'}
                    onClick={() => setBusinessAction('own')}>View shared credentials</Button>
                  <Button variant="outlined" disabled={!connected}
                    onClick={() => setBusinessAction('share')}>Create private share</Button>
                </Stack>
              </Stack>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }} sx={{ display: 'flex' }}>
            <LatestTransactions enabled={Boolean(connected && businessActor)} onSelect={openTransactionScan} />
          </Grid>
        </Grid>

        <Card className="flow-card" sx={{ mt: 4 }}><CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Typography variant="overline" color="secondary">How SynapseNet works</Typography>
          <Typography variant="h4">Business flow</Typography>
          <Box className="flow-row">
            {[
              ['01', 'Submit', 'A user submits a skill, role or certificate and names its authoritative verifier.'],
              ['02', 'Validate', 'The issuing enterprise reviews the structured evidence and approves or rejects it.'],
              ['03', 'Own', 'Approved credentials appear in the user-controlled credential wallet.'],
              ['04', 'Share', 'The user creates a purpose-bound, time-limited QR disclosure.']
            ].map(([number, title, detail], index) => <Box className="flow-step" component="button"
              type="button" key={number}
              onClick={() => setBusinessAction((['submit', 'validate', 'own', 'share'] as const)[index])}>
              <div className="flow-number">{number}</div>
              <Typography fontWeight={750} sx={{ mt: .5 }}>{title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{detail}</Typography>
            </Box>)}
          </Box>
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6">Ledger transaction workflow</Typography>
          <Box className="flow-row">
            {[
              ['01', 'Wallet signature', 'MetaMask signs a short-lived intent.'],
              ['02', 'API verification', 'FastAPI verifies identity and request shape.'],
              ['03', 'Fabric consensus', 'Authorized peers endorse and order the transaction.'],
              ['04', 'Status projection', 'The UI receives pending, approved, challenged or invalidated status.']
            ].map(([number, title, detail]) => <Box className="flow-step" key={title}>
              <div className="flow-number">{number}</div>
              <Typography fontWeight={750} sx={{ mt: .5 }}>{title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{detail}</Typography>
            </Box>)}
          </Box>
        </CardContent></Card>
        <OrganizationOnboarding enabled={connected} />
        <TrustDisputes address={address} />
      </Container>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} fullWidth maxWidth={dialog === 'credentials' ? 'xl' : 'md'}>
        <ModalTitle onClose={() => setDialog(null)}>{dialog === 'credentials' ? `${transactionStatus ? `${transactionStatus.replace('_', ' ')} ` : ''}Credential transactions` : 'Token transactions'}</ModalTitle>
        <DialogContent>
          {dialog === 'credentials' ? <TransactionScan status={transactionStatus} /> :
          <Stack spacing={1.5}>
            {data.tokenTransactions.map((item, index) =>
              <Card variant="outlined" key={String(item.credentialId ?? item.transactionId ?? index)}><CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="start">
                  <Box><Typography fontWeight={700}>{String(item.title ?? item.description ?? 'Ledger transaction')}</Typography><Typography variant="body2" color="text.secondary">{String(item.status ?? item.transactionType ?? '')}</Typography></Box>
                  <Tooltip title="Copy ledger ID"><IconButton size="small"><ContentCopyRounded fontSize="small" /></IconButton></Tooltip>
                </Stack>
              </CardContent></Card>)}
            {!connected && <Alert severity="info">Connect MetaMask to load your ledger wallet.</Alert>}
            {connected && !walletQuery.isLoading && data.tokenTransactions.length === 0 && <Alert severity="info">No records yet.</Alert>}
          </Stack>}
        </DialogContent>
      </Dialog>
      <Dialog open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} fullWidth maxWidth="md">
        <ModalTitle onClose={() => setDiagnosticsOpen(false)}>MetaMask connection diagnostics</ModalTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>This report excludes signatures, private keys, cookies, and challenge contents.</Alert>
          <Box component="pre" sx={{ p: 2, bgcolor: '#f5f7fb', borderRadius: 2, overflow: 'auto', fontSize: 12 }}>
            {diagnostics}
          </Box>
          <Button
            variant="outlined"
            startIcon={<ContentCopyRounded />}
            onClick={() => diagnostics && navigator.clipboard.writeText(diagnostics)}
          >Copy diagnostics</Button>
        </DialogContent>
      </Dialog>
      <BusinessActions
        action={businessAction}
        actor={businessActor}
        wallet={data}
        onClose={() => setBusinessAction(null)}
        onAuthenticated={authenticated}
        onSignOut={signOutBusiness}
        onRefresh={() => walletQuery.refetch()}
      />
      <SharedCredentials
        shareId={shareId}
        actor={businessActor}
        connected={connected}
        onAuthenticate={() => connected ? setBusinessAction('identity') : void connect()}
        onClose={closeSharedCredentials}
      />
    </Box>
  );
}
