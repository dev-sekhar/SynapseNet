import {
  Alert, Autocomplete, Button, Card, CardActionArea, CardContent, Checkbox, Chip, Collapse, Dialog,
  DialogContent, Divider, FormControlLabel, MenuItem, Stack, Tab, Tabs,
  TextField, Typography
} from '@mui/material';
import { useEffect, useState } from 'react';
import {
  businessBootstrap, createCredentialShare, LegacyActor, loginBusiness,
  registerProfessional, reviewCredentialRequest, submitCredentialRequest,
  WalletPayload
} from './api';
import { ModalTitle } from './ModalTitle';

export type BusinessAction = 'identity' | 'submit' | 'validate' | 'own' | 'share' | null;

type Props = {
  action: BusinessAction;
  actor: LegacyActor | null;
  wallet: WalletPayload;
  onClose: () => void;
  onAuthenticated: (actor: LegacyActor) => Promise<void>;
  onSignOut: () => Promise<void>;
  onRefresh: () => Promise<unknown>;
};

type Bootstrap = Awaited<ReturnType<typeof businessBootstrap>>;

type CredentialType = 'skill' | 'role' | 'education' | 'certificate' | 'other';

const evidenceTypes: Record<CredentialType, string[]> = {
  skill: ['Assessment Score', 'Code Repository', 'Work Deliverable', 'Certificate', 'Performance Review', 'Other'],
  role: ['Offer Letter', 'Employment Verification', 'Paystub', 'Performance Review', 'Other'],
  education: ['Official Transcript', 'Diploma Copy', 'Enrollment Verification', 'Other'],
  certificate: ['Certificate PDF', 'Digital Badge Export', 'Score Report', 'Other'],
  other: ['Award Letter', 'Patent Document', 'Article PDF', 'Reference Letter', 'Other']
};

function field(form: FormData, name: string) {
  return String(form.get(name) || '').trim();
}

function credentialDetails(form: FormData, type: string, state: {
  tools: string[];
  attestations: string[];
  associatedSkills: string[];
  isCurrentRole: boolean;
  certificateDoesNotExpire: boolean;
}): Record<string, unknown> {
  switch (type) {
    case 'skill':
      return {
        proficiencyLevel: field(form, 'proficiencyLevel'),
        yearsExperience: field(form, 'yearsExperience') ? Number(field(form, 'yearsExperience')) : undefined,
        practicalApplication: field(form, 'practicalApplication'),
        tools: state.tools,
        lastUsed: field(form, 'lastUsed'),
        attestations: state.attestations
      };
    case 'role':
      return {
        employmentType: field(form, 'employmentType'),
        startDate: field(form, 'startDate'),
        endDate: state.isCurrentRole ? undefined : field(form, 'endDate'),
        isCurrent: state.isCurrentRole,
        description: field(form, 'description'),
        associatedSkills: state.associatedSkills,
        verificationContact: field(form, 'verificationContact')
      };
    case 'education':
      return {
        fieldOfStudy: field(form, 'fieldOfStudy'),
        startDate: field(form, 'startDate'),
        completionDate: field(form, 'completionDate'),
        grade: field(form, 'grade'),
        description: field(form, 'description')
      };
    case 'certificate':
      return {
        credentialId: field(form, 'credentialId'),
        verificationUrl: field(form, 'verificationUrl'),
        issueDate: field(form, 'issueDate'),
        expirationDate: state.certificateDoesNotExpire ? undefined : field(form, 'expirationDate'),
        doesNotExpire: state.certificateDoesNotExpire,
        description: field(form, 'description')
      };
    default:
      return {
        category: field(form, 'category'),
        achievedDate: field(form, 'achievedDate'),
        referenceUrl: field(form, 'referenceUrl'),
        description: field(form, 'description')
      };
  }
}

function titleLabel(type: string) {
  return ({ skill: 'Skill name', role: 'Role / job title', education: 'Degree / credential title',
    certificate: 'Certificate title', other: 'Credential title' } as Record<string, string>)[type];
}

function titlePlaceholder(type: string) {
  return ({ skill: 'e.g., Python, Financial Modeling, Agile Leadership',
    role: 'e.g., Senior Product Manager, Lead Software Engineer',
    education: 'e.g., Bachelor of Science in Computer Science, MBA',
    certificate: 'e.g., AWS Certified Solutions Architect, PMP',
    other: 'e.g., US Patent #1092384, Hackathon 1st Place Winner' } as Record<string, string>)[type];
}

function titleHelp(type: string) {
  return type === 'skill' ? 'The core skill being claimed.' : undefined;
}

function enterpriseLabel(type: string) {
  return ({ role: 'Authoritative enterprise (employer)', education: 'Authoritative enterprise (institution)',
    certificate: 'Authoritative enterprise (issuing organization)', other: 'Authoritative enterprise / associated body'
  } as Record<string, string>)[type] || 'Authoritative enterprise';
}

function enterprisePlaceholder(type: string) {
  return ({ role: 'e.g., Google, Microsoft, Acme Corp', education: 'e.g., Stanford University, MIT',
    certificate: 'e.g., Amazon Web Services, PMI, Cisco', other: 'e.g., US Patent Office, IEEE, event or client'
  } as Record<string, string>)[type] || 'e.g., Coursera, AWS, Meta, or Company Name';
}

function enterpriseHelp(type: string) {
  return type === 'skill' ? 'Issuing body, employer, or platform verifying the skill.' : undefined;
}

function evidenceHelp(type: string) {
  return `Select proof type (e.g., ${evidenceTypes[type as CredentialType].slice(0, 2).join(', ')})`;
}

function messageOf(reason: unknown) {
  const error = reason as { response?: { data?: { detail?: string } }; message?: string };
  return error.response?.data?.detail || error.message || 'The request could not be completed.';
}

async function hashFile(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')).join('')}`;
}

export function BusinessActions({
  action, actor, wallet, onClose, onAuthenticated, onSignOut, onRefresh
}: Props) {
  const [authTab, setAuthTab] = useState(0);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentialType, setCredentialType] = useState<CredentialType>('skill');
  const [enterpriseId, setEnterpriseId] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [attestations, setAttestations] = useState<string[]>([]);
  const [associatedSkills, setAssociatedSkills] = useState<string[]>([]);
  const [isCurrentRole, setIsCurrentRole] = useState(false);
  const [certificateDoesNotExpire, setCertificateDoesNotExpire] = useState(false);
  const [shareResult, setShareResult] = useState<{ shareUrl: string; qrDataUrl: string } | null>(null);

  useEffect(() => {
    setNotice(null);
    setShareResult(null);
    if (action && action !== 'identity' && actor) {
      void businessBootstrap().then(setBootstrap).catch((reason) => {
        setNotice({ severity: 'error', text: messageOf(reason) });
      });
    }
  }, [action, actor]);

  async function authenticate(form: FormData) {
    setBusy(true);
    setNotice(null);
    try {
      const identity = await loginBusiness(
        String(form.get('actorId') || ''),
        String(form.get('password') || '')
      );
      await onAuthenticated(identity);
      onClose();
    } catch (reason) {
      setNotice({ severity: 'error', text: messageOf(reason) });
    } finally {
      setBusy(false);
    }
  }

  async function register(form: FormData) {
    setBusy(true);
    setNotice(null);
    try {
      const actorId = String(form.get('userId') || '');
      const password = String(form.get('password') || '');
      await registerProfessional({
        userId: actorId,
        displayName: String(form.get('displayName') || ''),
        password
      });
      const identity = await loginBusiness(actorId, password);
      await onAuthenticated(identity);
      onClose();
    } catch (reason) {
      setNotice({ severity: 'error', text: messageOf(reason) });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setNotice(null);
    try {
      await onSignOut();
      onClose();
    } catch (reason) {
      setNotice({ severity: 'error', text: messageOf(reason) });
    } finally {
      setBusy(false);
    }
  }

  async function submitEvidence(form: FormData) {
    setBusy(true);
    setNotice(null);
    try {
      const file = form.get('evidenceFile');
      if (!(file instanceof File) || file.size === 0) throw new Error('Choose an evidence file.');
      if (!enterpriseId) throw new Error('Choose an authoritative enterprise.');
      if (file.size > 25 * 1024 * 1024) throw new Error('Evidence files must not exceed 25 MB.');
      const requestId = await submitCredentialRequest({
        enterpriseId: String(form.get('enterpriseId') || ''),
        credentialType: String(form.get('credentialType') || ''),
        title: String(form.get('title') || ''),
        details: credentialDetails(form, credentialType, {
          tools, attestations, associatedSkills, isCurrentRole, certificateDoesNotExpire
        }),
        evidence: [{
          evidenceId: `evidence-${crypto.randomUUID()}`,
          documentType: String(form.get('documentType') || file.type || 'document'),
          fileName: file.name,
          contentHash: await hashFile(file),
          storageProvider: String(form.get('storageProvider') || 'User controlled'),
          storageReference: String(form.get('storageReference') || '')
        }]
      });
      await onRefresh();
      setNotice({ severity: 'success', text: `Request ${requestId} was sent for enterprise validation. The file itself was not uploaded.` });
    } catch (reason) {
      setNotice({ severity: 'error', text: messageOf(reason) });
    } finally {
      setBusy(false);
    }
  }

  async function review(requestId: string, decision: 'approve' | 'reject', notes: string) {
    setBusy(true);
    setNotice(null);
    try {
      await reviewCredentialRequest(requestId, decision, notes);
      setBootstrap(await businessBootstrap());
      await onRefresh();
      setNotice({ severity: 'success', text: `Credential ${decision === 'approve' ? 'approved and issued' : 'rejected'}.` });
    } catch (reason) {
      setNotice({ severity: 'error', text: messageOf(reason) });
    } finally {
      setBusy(false);
    }
  }

  async function share(form: FormData) {
    setBusy(true);
    setNotice(null);
    try {
      const credentialIds = form.getAll('credentialIds').map(String);
      if (!credentialIds.length) throw new Error('Select at least one credential.');
      const validFrom = new Date(String(form.get('validFrom') || ''));
      const expiresAt = new Date(String(form.get('expiresAt') || ''));
      if (Number.isNaN(validFrom.valueOf()) || Number.isNaN(expiresAt.valueOf())) {
        throw new Error('Choose valid sharing dates.');
      }
      const result = await createCredentialShare({
        credentialIds,
        recipient: String(form.get('recipient') || ''),
        purpose: String(form.get('purpose') || ''),
        validFrom: validFrom.toISOString(),
        expiresAt: expiresAt.toISOString()
      });
      setShareResult(result);
      setNotice({ severity: 'success', text: 'Private credential share created.' });
    } catch (reason) {
      setNotice({ severity: 'error', text: messageOf(reason) });
    } finally {
      setBusy(false);
    }
  }

  const needsIdentity = action !== null && action !== 'identity' && !actor;
  const title = needsIdentity || action === 'identity' ? 'Business profile'
    : action === 'submit' ? 'Submit evidence'
      : action === 'validate' ? 'Enterprise validation queue'
        : action === 'own' ? 'Credential wallet'
          : 'Create private share';

  return <Dialog open={action !== null} onClose={onClose} fullWidth maxWidth="md">
    <ModalTitle onClose={onClose}>{title}</ModalTitle>
    <DialogContent>
      {notice && <Alert severity={notice.severity} sx={{ my: 2 }}>{notice.text}</Alert>}
      {(needsIdentity || action === 'identity') && !actor && <>
        <Alert severity="info" sx={{ mt: 1 }}>
          MetaMask verifies your wallet. Sign in to a SynapseNet business profile to submit, validate, or share credentials.
        </Alert>
        <Tabs value={authTab} onChange={(_, value) => setAuthTab(value)} sx={{ mt: 1 }}>
          <Tab label="Sign in" /><Tab label="Create professional profile" />
        </Tabs>
        {authTab === 0 ?
          <Stack component="form" action={(form) => void authenticate(form)} spacing={2} sx={{ pt: 2 }}>
            <TextField name="actorId" label="User or reviewer ID" required />
            <TextField name="password" label="Password" type="password" required />
            <Button type="submit" variant="contained" disabled={busy}>Sign in and link wallet</Button>
          </Stack> :
          <Stack component="form" action={(form) => void register(form)} spacing={2} sx={{ pt: 2 }}>
            <TextField name="userId" label="Professional user ID" required />
            <TextField name="displayName" label="Display name" required />
            <TextField name="password" label="Password" type="password" required helperText="At least 10 characters." />
            <Button type="submit" variant="contained" disabled={busy}>Create profile and link wallet</Button>
          </Stack>}
      </>}

      {actor && action === 'identity' && <Stack spacing={2} sx={{ mt: 1 }}>
        <Typography>
          {actor.displayName || actor.actorId} · {actor.role}
        </Typography>
        <Button variant="outlined" color="error" disabled={busy} onClick={() => void signOut()}>
          Sign out and switch profile
        </Button>
      </Stack>}

      {actor?.role === 'user' && action === 'submit' &&
        <Stack component="form" action={(form) => void submitEvidence(form)} spacing={2} sx={{ pt: 1 }}>
          <Autocomplete options={bootstrap?.enterprises || []}
            getOptionLabel={(item) => item.name}
            value={(bootstrap?.enterprises || []).find(item => item.enterpriseId === enterpriseId) || null}
            onChange={(_, item) => setEnterpriseId(item?.enterpriseId || '')}
            renderInput={(params) => <TextField {...params} label={enterpriseLabel(credentialType)} required
              placeholder={enterprisePlaceholder(credentialType)} helperText={enterpriseHelp(credentialType)} />} />
          <input type="hidden" name="enterpriseId" value={enterpriseId} />
          <TextField select name="credentialType" label="Credential type" required value={credentialType}
            onChange={(event) => setCredentialType(event.target.value as CredentialType)}>
            {(['skill', 'role', 'education', 'certificate', 'other'] as CredentialType[]).map((type) =>
              <MenuItem key={type} value={type}>{type}</MenuItem>)}
          </TextField>
          <TextField name="title" label={titleLabel(credentialType)} required
            placeholder={titlePlaceholder(credentialType)}
            helperText={titleHelp(credentialType)} />
          {credentialType === 'skill' ? <>
            <TextField select name="proficiencyLevel" label="Proficiency level" required defaultValue=""
              helperText="Select your mastery level...">
              {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(level =>
                <MenuItem key={level} value={level}>{level}</MenuItem>)}
            </TextField>
            <TextField name="yearsExperience" label="Years of experience" type="number"
              placeholder="e.g., 3.5" slotProps={{ htmlInput: { min: 0, max: 80, step: 0.5 } }} />
            <TextField name="practicalApplication" label="Context & practical application" multiline minRows={4} required
              placeholder="Describe how you applied this skill, key projects, and outcomes..."
              helperText="Explain where the skill was applied and its business impact." />
            <Autocomplete multiple freeSolo options={[]} value={tools} onChange={(_, value) => setTools(value)}
              renderInput={(params) => <TextField {...params} label="Associated tools & frameworks"
                placeholder="Type a tool and press Enter (e.g., Pandas, Docker, Figma)" />} />
            <TextField name="lastUsed" label="Last used date" type="month"
              helperText="Leave blank if currently using this skill." slotProps={{ inputLabel: { shrink: true } }} />
            <Autocomplete multiple freeSolo options={[]} value={attestations}
              onChange={(_, value) => setAttestations(value)}
              renderInput={(params) => <TextField {...params} label="Peer / manager attestation"
                placeholder="Enter an email or handle and press Enter" />} />
          </> : credentialType === 'role' ? <>
            <TextField select name="employmentType" label="Employment type" required defaultValue=""
              helperText="Select the nature of the working engagement.">
              {['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'].map(type =>
                <MenuItem key={type} value={type}>{type}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField name="startDate" label="Start date" type="month" required fullWidth
                slotProps={{ inputLabel: { shrink: true } }} />
              <TextField name="endDate" label="End date" type="month" required={!isCurrentRole}
                disabled={isCurrentRole} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            <FormControlLabel control={<Checkbox checked={isCurrentRole}
              onChange={(event) => setIsCurrentRole(event.target.checked)} />}
              label="I currently work here" />
            <TextField name="description" label="Role description & key accomplishments" multiline minRows={4} required
              placeholder="Summarize core responsibilities, team leadership, and major achievements..." />
            <Autocomplete multiple freeSolo options={[]} value={associatedSkills}
              onChange={(_, value) => setAssociatedSkills(value)}
              renderInput={(params) => <TextField {...params} label="Associated skills & tech stack"
                placeholder="Add a skill and press Enter (e.g., Leadership, React, System Design)" />} />
            <TextField name="verificationContact" label="Manager / peer contact for verification"
              placeholder="e.g., manager@company.com or HR reference contact" />
          </> : credentialType === 'education' ? <>
            <TextField name="fieldOfStudy" label="Field of study / major" required
              placeholder="e.g., Software Engineering, Economics, Graphic Design" />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField name="startDate" label="Start date" type="month" required fullWidth
                slotProps={{ inputLabel: { shrink: true } }} />
              <TextField name="completionDate" label="Graduation / completion date" type="month" required fullWidth
                slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            <TextField name="grade" label="Grade / GPA / honors"
              placeholder="e.g., 3.8/4.0, Magna Cum Laude, First Class Honors" />
            <TextField name="description" label="Activities & societies / description" multiline minRows={3}
              placeholder="e.g., Student Body President, Robotics Club, Thesis topic..." />
          </> : credentialType === 'certificate' ? <>
            <TextField name="credentialId" label="Credential ID / registration number"
              placeholder="e.g., ABC-123456789-XYZ" />
            <TextField name="verificationUrl" label="Credential verification URL" type="url"
              placeholder="e.g., https://www.credly.com/badges/your-badge-id" />
            <TextField name="issueDate" label="Issue date" type="month" required
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField name="expirationDate" label="Expiration date" type="month"
              disabled={certificateDoesNotExpire}
              slotProps={{ inputLabel: { shrink: true } }} />
            <FormControlLabel control={<Checkbox checked={certificateDoesNotExpire}
              onChange={(event) => setCertificateDoesNotExpire(event.target.checked)} />}
              label="This certificate does not expire" />
            <TextField name="description" label="Business description / scope" multiline minRows={3}
              placeholder="Brief overview of competencies tested and covered in this certification..." />
          </> : <>
            <TextField select name="category" label="Category / classification" defaultValue=""
              helperText="Choose the closest category for this credential.">
              {['Patent', 'Publication', 'Award / Honor', 'Volunteer Work', 'Language', 'Other'].map(type =>
                <MenuItem key={type} value={type}>{type}</MenuItem>)}
            </TextField>
            <TextField name="achievedDate" label="Date achieved / published" type="month"
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField name="referenceUrl" label="Reference URL / DOI" type="url"
              placeholder="e.g., https://doi.org/10.1000/182 or website link" />
            <TextField name="description" label="Business description" multiline minRows={4} required
              placeholder="Describe the significance, contribution, or context of this credential..." />
          </>}
          <TextField select name="documentType" label="Evidence document type" required defaultValue=""
            helperText={evidenceHelp(credentialType)}>
            {evidenceTypes[credentialType].map(type =>
              <MenuItem key={type} value={type}>{type}</MenuItem>)}
          </TextField>
          <Button component="label" variant="outlined">Upload evidence file
            <input hidden required type="file" name="evidenceFile" accept=".pdf,.png,.jpg,.jpeg,.zip" />
          </Button>
          <TextField name="storageProvider" label="Secure storage provider" defaultValue="User controlled" required />
          <TextField name="storageReference" label="Encrypted storage reference (optional)"
            placeholder="e.g., ipfs://... or SHA-256 hash reference" />
          <Alert severity="info">Only the file name and SHA-256 hash are submitted. The file is not uploaded.</Alert>
          <Button type="submit" variant="contained" disabled={busy || !bootstrap}>Send for validation</Button>
        </Stack>}

      {actor?.role === 'reviewer' && action === 'validate' &&
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            These records come from the Fabric ledger and are limited to {actor.enterpriseId}.
            Pending requests can be approved or rejected; completed records are read-only.
          </Alert>
          {(bootstrap?.credentialRequests || []).map((item) =>
            item.status === 'pending_validation'
              ? <ReviewCard key={String(item.requestId)} item={item} busy={busy} onReview={review} />
              : <LedgerRequestCard key={String(item.requestId)} item={item} />)}
          {bootstrap && bootstrap.credentialRequests.length === 0 &&
            <Alert severity="info">No credential requests are recorded for this enterprise.</Alert>}
        </Stack>}

      {actor && action === 'validate' && actor.role !== 'reviewer' &&
        <Alert severity="info" sx={{ mt: 1 }}>Validation is available to authorized enterprise reviewers.</Alert>}

      {actor?.role === 'user' && action === 'own' &&
        <Stack spacing={1.5}>
          <Alert severity="info">
            These requests and their current statuses are read directly from the Fabric ledger.
          </Alert>
          <Typography variant="h6">Your credential requests</Typography>
          {wallet.credentialRequests.map((item, index) =>
            <LedgerRequestCard key={String(item.requestId ?? index)} item={item} />)}
          {!wallet.credentialRequests.length && <Alert severity="info">No credential requests yet.</Alert>}
          <Divider />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Shared with you</Typography>
            <Chip size="small" label={wallet.sharedCredentials.length} />
          </Stack>
          {wallet.sharedCredentials.map((share) =>
            <SharedWalletCard key={share.grant.shareId} share={share} />)}
          {!wallet.sharedCredentials.length &&
            <Alert severity="info">No credentials have been shared with you.</Alert>}
        </Stack>}

      {actor?.role === 'user' && action === 'share' &&
        <Stack component="form" action={(form) => void share(form)} spacing={2} sx={{ pt: 1 }}>
          <Typography fontWeight={700}>Select credentials</Typography>
          {wallet.credentials.map((item, index) =>
            <FormControlLabel key={String(item.credentialId ?? index)}
              control={<Checkbox name="credentialIds" value={String(item.credentialId)} />}
              label={String(item.title || item.credentialId)} />)}
          {!wallet.credentials.length && <Alert severity="info">You need an approved credential before creating a share.</Alert>}
          <TextField select name="recipient" label="Registered recipient" required defaultValue="">
            {(bootstrap?.directory || []).filter((item) => item.userId !== actor.actorId).map((item) =>
              <MenuItem key={item.userId} value={item.userId}>{item.displayName} ({item.userId})</MenuItem>)}
          </TextField>
          <TextField name="purpose" label="Sharing purpose" required />
          <TextField name="validFrom" label="Valid from" type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} required />
          <TextField name="expiresAt" label="Expires at" type="datetime-local" slotProps={{ inputLabel: { shrink: true } }} required />
          <Button type="submit" variant="contained" disabled={busy || !wallet.credentials.length}>Create private share</Button>
          {shareResult && <Stack alignItems="center" spacing={1}>
            <img src={shareResult.qrDataUrl} alt="Private credential share QR code" width={220} height={220} />
            <Button href={shareResult.shareUrl} target="_blank">Open share link</Button>
          </Stack>}
        </Stack>}

      {actor && action === 'share' && actor.role !== 'user' &&
        <Alert severity="info" sx={{ mt: 1 }}>Credential sharing is controlled by the professional who owns the credential.</Alert>}
    </DialogContent>
  </Dialog>;
}

function ReviewCard({
  item, busy, onReview
}: {
  item: Record<string, unknown>;
  busy: boolean;
  onReview: (id: string, decision: 'approve' | 'reject', notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  return <Card variant="outlined"><CardContent>
    <Typography fontWeight={750}>{String(item.title || 'Credential request')}</Typography>
    <Typography variant="body2" color="text.secondary">
      {String(item.credentialType || '')} · Applicant {String(item.userId || '')}
    </Typography>
    <TextField value={notes} onChange={(event) => setNotes(event.target.value)}
      label="Decision notes" fullWidth multiline minRows={2} sx={{ my: 2 }} />
    <Stack direction="row" spacing={1}>
      <Button variant="contained" disabled={busy}
        onClick={() => void onReview(String(item.requestId), 'approve', notes)}>Approve</Button>
      <Button color="error" variant="outlined" disabled={busy}
        onClick={() => void onReview(String(item.requestId), 'reject', notes)}>Reject</Button>
    </Stack>
  </CardContent></Card>;
}

function LedgerRequestCard({ item }: { item: Record<string, unknown> }) {
  const status = String(item.status || 'unknown');
  const color = status === 'approved' ? 'success'
    : status === 'rejected' ? 'error'
      : 'default';
  return <Card variant="outlined"><CardContent>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
      <div>
        <Typography fontWeight={750}>{String(item.title || 'Credential request')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {String(item.credentialType || '')} · Applicant {String(item.userId || '')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Ledger request {String(item.requestId || '')}
        </Typography>
      </div>
      <Chip size="small" color={color} label={status.replaceAll('_', ' ')} />
    </Stack>
  </CardContent></Card>;
}

function remainingTime(milliseconds: number) {
  if (milliseconds <= 0) return 'Expired';
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours ? `${hours}h ` : ''}${minutes}m ${remainder}s`;
}

function SharedWalletCard({
  share
}: {
  share: WalletPayload['sharedCredentials'][number];
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const validFrom = Date.parse(share.grant.validFrom);
  const expiresAt = Date.parse(share.grant.expiresAt);
  const started = now >= validFrom;
  const available = share.grant.status === 'active' && started && now < expiresAt;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <Card variant="outlined">
    <CardActionArea onClick={() => setOpen((value) => !value)}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
          <div>
            <Typography fontWeight={750}>Shared by {share.grant.ownerId}</Typography>
            <Typography variant="body2" color="text.secondary">{share.grant.purpose}</Typography>
          </div>
          <Stack alignItems={{ sm: 'end' }}>
            <Chip size="small" color={available ? 'success' : 'default'}
              label={available ? 'Available' : started ? 'Expired' : 'Scheduled'} />
            <Typography variant="caption" sx={{ mt: .5 }}>
              {started
                ? `Time remaining: ${remainingTime(expiresAt - now)}`
                : `Available in: ${remainingTime(validFrom - now)}`}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </CardActionArea>
    <Collapse in={open}>
      <Divider />
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          Ledger share {share.grant.shareId}
        </Typography>
        {available ? <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          {share.credentials.map((credential, index) =>
            <Card variant="outlined" key={String(credential.credentialId ?? index)}>
              <CardContent>
                <Typography fontWeight={700}>
                  {String(credential.title || credential.credentialType || 'Verified credential')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Issued by {String(credential.issuerEnterpriseId || '')}
                </Typography>
                <Typography variant="caption">
                  Credential {String(credential.credentialId || '')}
                </Typography>
              </CardContent>
            </Card>)}
        </Stack> : <Alert severity="warning" sx={{ mt: 1.5 }}>
          Credential details are hidden outside the sharing window.
        </Alert>}
      </CardContent>
    </Collapse>
  </Card>;
}
