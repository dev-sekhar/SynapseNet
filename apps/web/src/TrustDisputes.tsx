import { GavelRounded } from '@mui/icons-material';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogContent,
  Stack, Tab, Tabs, TextField, Typography
} from '@mui/material';
import { useState } from 'react';
import { appealIncident, migrationContext, reportIncident } from './api';
import { sha256, signIntent } from './intents';
import { ModalTitle } from './ModalTitle';

export function TrustDisputes({ address }: { address: string | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function actor() {
    const value = await migrationContext();
    if (!value) throw new Error('Register and log in before using the dispute process.');
    if (!address) throw new Error('Connect MetaMask first.');
    return value;
  }

  async function submitReport(form: FormData) {
    setBusy(true);
    setMessage(null);
    try {
      const identity = await actor();
      const incidentId = crypto.randomUUID();
      const accusedActorId = String(form.get('accusedActorId') || '').trim();
      const credentialId = String(form.get('credentialId') || '').trim();
      const allegation = String(form.get('allegation') || '').trim();
      if (!accusedActorId || allegation.length < 10) throw new Error('Provide an accused actor and a clear allegation.');
      const incident: Record<string, unknown> = {
        incidentId,
        accusedActorId,
        reporterActorId: identity.actorId,
        allegationHash: await sha256(allegation)
      };
      if (credentialId) incident.credentialId = credentialId;
      const signed = await signIntent('reportIncident', identity.actorId, address!, incident);
      await reportIncident({
        incidentId,
        accusedActorId,
        credentialId: credentialId || undefined,
        allegationHash: String(incident.allegationHash),
        ...signed
      });
      setMessage({ type: 'success', text: `Incident ${incidentId} submitted. The issuer response deadline is now on-ledger.` });
    } catch (reason) {
      setMessage({ type: 'error', text: reason instanceof Error ? reason.message : 'Incident submission failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function submitAppeal(form: FormData) {
    setBusy(true);
    setMessage(null);
    try {
      const identity = await actor();
      const incidentId = String(form.get('incidentId') || '').trim();
      if (!incidentId) throw new Error('Provide the incident ID.');
      const signed = await signIntent('appealIncident', identity.actorId, address!, { incidentId, actorId: identity.actorId });
      await appealIncident(incidentId, signed);
      setMessage({ type: 'success', text: `Appeal recorded for ${incidentId}.` });
    } catch (reason) {
      setMessage({ type: 'error', text: reason instanceof Error ? reason.message : 'Appeal failed.' });
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }}>
          <GavelRounded color="secondary" fontSize="large" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5">Credential trust & appeals</Typography>
            <Typography color="text.secondary">
              Challenge suspicious approvals or appeal a decision. Response and appeal deadlines are enforced by the ledger.
            </Typography>
          </Box>
          <Button variant="outlined" disabled={!address} onClick={() => setOpen(true)}>Open dispute centre</Button>
        </Stack>
      </CardContent>
    </Card>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <ModalTitle onClose={() => setOpen(false)}>Dispute centre</ModalTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, value) => { setTab(value); setMessage(null); }}>
          <Tab label="Report incident" /><Tab label="Appeal decision" />
        </Tabs>
        {message && <Alert severity={message.type} sx={{ mt: 2 }}>{message.text}</Alert>}
        {tab === 0 ? (
          <Stack component="form" spacing={2} sx={{ pt: 2 }} action={(form) => void submitReport(form)}>
            <TextField name="accusedActorId" label="Enterprise or user actor ID" required />
            <TextField name="credentialId" label="Credential ID (optional)" />
            <TextField name="allegation" label="What happened?" multiline minRows={4} required helperText="Only its SHA-256 hash is placed on-ledger." />
            <Button type="submit" variant="contained" disabled={busy}>Sign and report</Button>
          </Stack>
        ) : (
          <Stack component="form" spacing={2} sx={{ pt: 2 }} action={(form) => void submitAppeal(form)}>
            <TextField name="incidentId" label="Incident ID" required />
            <Typography variant="body2" color="text.secondary">Only an eligible party can appeal, and only before the on-ledger appeal deadline.</Typography>
            <Button type="submit" variant="contained" disabled={busy}>Sign and appeal</Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  </>;
}
