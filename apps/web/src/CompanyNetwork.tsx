import { BusinessRounded, PersonRounded } from '@mui/icons-material';
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCompanyNetwork, setCompanyFollow } from './api';

type Point = { x: number; y: number };

function companyPosition(index: number, total: number): Point {
  const firstRingSize = total > 8 ? Math.ceil(total / 2) : total;
  const secondRing = total > 8 && index >= firstRingSize;
  const ringStart = secondRing ? firstRingSize : 0;
  const ringSize = secondRing ? total - firstRingSize : firstRingSize;
  const angle = ((index - ringStart) / Math.max(ringSize, 1)) * Math.PI * 2 - Math.PI / 2;
  return {
    x: 50 + Math.cos(angle) * (secondRing ? 42 : 31),
    y: 50 + Math.sin(angle) * (secondRing ? 39 : 29)
  };
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function CompanyNetwork({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const network = useQuery({
    queryKey: ['company-network'], queryFn: getCompanyNetwork, enabled, refetchInterval: 30_000
  });
  const follow = useMutation({
    mutationFn: ({ enterpriseId, value }: { enterpriseId: string; value: boolean }) =>
      setCompanyFollow(enterpriseId, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-network'] })
  });
  if (!enabled) return null;
  const data = network.data;
  const points = data?.companies.map((_, index) => companyPosition(index, data.companies.length)) ?? [];

  return <Card className="company-network-card" sx={{ mt: 4 }}>
    <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="overline" color="secondary">Professional network</Typography>
          <Typography variant="h4">Companies you follow</Typography>
          <Typography color="text.secondary" sx={{ mt: .5 }}>
            Your identity stays at the center. Select an organization to follow or unfollow it.
          </Typography>
        </Box>
        <Chip icon={<BusinessRounded />} label={`${data?.followingCount ?? 0} following`} />
      </Stack>
      {network.isLoading && <Box className="network-state"><CircularProgress size={30} /></Box>}
      {network.isError && <Alert severity="error" sx={{ mt: 3 }}>The company network could not be loaded.</Alert>}
      {data && data.companies.length === 0 && <Alert severity="info" sx={{ mt: 3 }}>No companies have been registered yet.</Alert>}
      {data && data.companies.length > 0 && <Box className="network-graph" role="group" aria-label="Your company network">
        <svg className="network-links" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
          {points.map((point, index) => <line key={data.companies[index].enterpriseId}
            x1="50" y1="50" x2={point.x} y2={point.y}
            className={data.companies[index].followed ? 'followed' : ''} />)}
        </svg>
        <Box className="network-person-node">
          <Avatar><PersonRounded /></Avatar>
          <Typography fontWeight={800} noWrap>{data.individual.displayName}</Typography>
          <Typography variant="caption" color="text.secondary">You</Typography>
        </Box>
        {data.companies.map((company, index) => <Box className={`network-company-node ${company.followed ? 'is-followed' : ''}`}
          key={company.enterpriseId} sx={{ left: `${points[index].x}%`, top: `${points[index].y}%` }}>
          <Avatar src={company.logoUrl || undefined} alt={`${company.name} logo`}>{initials(company.name)}</Avatar>
          <Typography variant="body2" fontWeight={800} noWrap title={company.name}>{company.name}</Typography>
          <Button size="small" variant={company.followed ? 'contained' : 'outlined'} disabled={follow.isPending}
            aria-label={`${company.followed ? 'Unfollow' : 'Follow'} ${company.name}`}
            onClick={() => follow.mutate({ enterpriseId: company.enterpriseId, value: !company.followed })}>
            {company.followed ? 'Following' : 'Follow'}
          </Button>
        </Box>)}
      </Box>}
    </CardContent>
  </Card>;
}
