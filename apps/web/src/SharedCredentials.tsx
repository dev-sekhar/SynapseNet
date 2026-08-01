import {
  Alert, Button, Card, CardContent, Chip, Dialog, DialogContent,
  LinearProgress, Stack, Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getCredentialShare, LegacyActor } from './api';
import { ModalTitle } from './ModalTitle';

type Props = {
  shareId: string | null;
  actor: LegacyActor | null;
  connected: boolean;
  onAuthenticate: () => void;
  onClose: () => void;
};

function messageOf(reason: unknown) {
  const error = reason as { response?: { data?: { detail?: string } }; message?: string };
  return error.response?.data?.detail || error.message || 'The credential share could not be opened.';
}

function duration(milliseconds: number) {
  if (milliseconds <= 0) return 'Expired';
  const seconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [
    days ? `${days}d` : '',
    hours || days ? `${hours}h` : '',
    `${minutes}m`,
    `${remainder}s`
  ].filter(Boolean).join(' ');
}

export function SharedCredentials({
  shareId, actor, connected, onAuthenticate, onClose
}: Props) {
  const [now, setNow] = useState(Date.now());
  const shareQuery = useQuery({
    queryKey: ['credential-share', shareId, actor?.actorId],
    queryFn: () => getCredentialShare(shareId!),
    enabled: Boolean(shareId && actor)
  });

  useEffect(() => {
    if (!shareQuery.data) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [shareQuery.data]);

  const share = shareQuery.data;
  const expiresAt = share ? Date.parse(share.grant.expiresAt) : 0;
  const validFrom = share ? Date.parse(share.grant.validFrom) : 0;
  const remaining = expiresAt - now;
  const started = validFrom <= now;
  const active = Boolean(share?.accessible && started && remaining > 0);
  const totalWindow = Math.max(expiresAt - validFrom, 1);
  const elapsedPercent = Math.min(100, Math.max(0, ((now - validFrom) / totalWindow) * 100));

  return <Dialog open={shareId !== null} onClose={onClose} fullWidth maxWidth="md">
    <ModalTitle onClose={onClose}>Shared credentials</ModalTitle>
    <DialogContent>
      {!actor && <Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">
          This disclosure is private. Connect and sign in as its named recipient to view it.
        </Alert>
        <Button variant="contained" onClick={onAuthenticate}>
          {connected ? 'Business sign in' : 'Connect MetaMask'}
        </Button>
      </Stack>}

      {actor && shareQuery.isLoading && <LinearProgress sx={{ mt: 1 }} />}
      {actor && shareQuery.isError && <Alert severity="error" sx={{ mt: 1 }}>
        {messageOf(shareQuery.error)}
      </Alert>}

      {share && <Stack spacing={2} sx={{ pt: 1 }}>
        <Card variant="outlined"><CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
            <div>
              <Typography variant="overline">Purpose</Typography>
              <Typography variant="h6">{share.grant.purpose}</Typography>
              <Typography variant="body2" color="text.secondary">
                Shared by {share.grant.ownerId} with {share.grant.recipient}
              </Typography>
            </div>
            <Chip color={active ? 'success' : 'error'} label={active ? 'Available' : 'Unavailable'} />
          </Stack>
          <Typography fontWeight={750} sx={{ mt: 2 }}>
            {started ? `Time remaining: ${duration(remaining)}` : `Available in: ${duration(validFrom - now)}`}
          </Typography>
          <LinearProgress
            color={active ? 'success' : 'error'}
            variant="determinate"
            value={started ? elapsedPercent : 0}
            sx={{ mt: 1 }}
          />
          <Typography variant="caption" color="text.secondary">
            Expires {new Date(share.grant.expiresAt).toLocaleString()}
          </Typography>
        </CardContent></Card>

        {active && share.credentials.map((credential, index) =>
          <Card variant="outlined" key={String(credential.credentialId ?? index)}>
            <CardContent>
              <Typography fontWeight={750}>
                {String(credential.title || credential.credentialType || 'Verified credential')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Issued by {String(credential.issuerEnterpriseId || '')}
              </Typography>
              <Typography variant="caption">
                Ledger credential {String(credential.credentialId || '')}
              </Typography>
            </CardContent>
          </Card>)}

        {!active && <Alert severity="warning">
          These credentials are hidden because the disclosure is not currently active.
        </Alert>}
      </Stack>}
    </DialogContent>
  </Dialog>;
}
