import { zodResolver } from '@hookform/resolvers/zod';
import { BusinessRounded } from '@mui/icons-material';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogContent,
  Stack, TextField, Typography
} from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { applyForOrganization } from './api';
import { ModalTitle } from './ModalTitle';

const schema = z.object({
  legalName: z.string().min(2).max(240),
  displayName: z.string().min(2).max(160),
  jurisdiction: z.string().min(2).max(120),
  registrationNumber: z.string().min(2).max(160),
  requestedMspId: z.string().regex(/^[A-Za-z][A-Za-z0-9]{2,63}MSP$/, 'Use a stable ID such as IITMadrasMSP')
});
type Form = z.infer<typeof schema>;

export function OrganizationOnboarding({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema)
  });

  async function submit(values: Form) {
    const application = await applyForOrganization(values);
    setResult(`${application.applicationId} · ${application.status}`);
  }

  return <>
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }}>
          <BusinessRounded color="secondary" fontSize="large" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5">Join as a legal entity</Typography>
            <Typography color="text.secondary">
              Capture legal identity now. Governance approval provisions the entity CA, MSP and peer.
            </Typography>
          </Box>
          <Button variant="outlined" disabled={!enabled} onClick={() => setOpen(true)}>Apply to consortium</Button>
        </Stack>
      </CardContent>
    </Card>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <ModalTitle onClose={() => setOpen(false)}>Enterprise consortium application</ModalTitle>
      <DialogContent>
        <Stack component="form" spacing={2} sx={{ pt: 1 }} onSubmit={handleSubmit(submit)}>
          {result && <Alert severity="success">{result}</Alert>}
          <TextField label="Exact legal entity name" {...register('legalName')} error={!!errors.legalName} helperText={errors.legalName?.message} />
          <TextField label="Display name" {...register('displayName')} error={!!errors.displayName} helperText={errors.displayName?.message} />
          <TextField label="Jurisdiction" {...register('jurisdiction')} error={!!errors.jurisdiction} helperText={errors.jurisdiction?.message} />
          <TextField label="Legal registration number" {...register('registrationNumber')} error={!!errors.registrationNumber} helperText={errors.registrationNumber?.message} />
          <TextField label="Requested MSP ID" placeholder="IITMadrasMSP" {...register('requestedMspId')} error={!!errors.requestedMspId} helperText={errors.requestedMspId?.message} />
          <Button type="submit" variant="contained" disabled={isSubmitting}>Submit governed application</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  </>;
}
