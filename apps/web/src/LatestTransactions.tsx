import { CircleRounded, ReceiptLongRounded } from '@mui/icons-material';
import {
  Alert, Box, Card, CardActionArea, CardContent, Chip, Divider, Stack, Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { CredentialTransaction, getTransactions } from './api';

function transactionTime(item: CredentialTransaction) {
  const value = Number(item.timestamp);
  if (Number.isFinite(value)) return value * 1000;
  const parsed = Date.parse(item.timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function relativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function LatestTransactions({
  enabled, onSelect
}: {
  enabled: boolean;
  onSelect: (status?: string) => void;
}) {
  const query = useQuery({
    queryKey: ['latest-credential-transactions'],
    queryFn: () => getTransactions(),
    enabled,
    refetchInterval: enabled ? 5_000 : false,
    refetchIntervalInBackground: true
  });

  const latest = query.data ? [...query.data.items]
    .sort((left, right) => transactionTime(right) - transactionTime(left))
    .slice(0, 5) : [];

  return <Card className="latest-transactions-card">
    <CardContent className="latest-transactions-heading">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <ReceiptLongRounded color="primary" />
          <Box>
            <Typography variant="overline" color="secondary">Live ledger</Typography>
            <Typography variant="h5">Latest transactions</Typography>
          </Box>
        </Stack>
        <span className="pulse" aria-label="Updating automatically" />
      </Stack>
    </CardContent>
    <Divider />
    <Box className="latest-transactions-list" aria-live="polite">
      {!enabled && <Alert severity="info" sx={{ m: 2 }}>
        Connect your wallet to load transaction activity.
      </Alert>}
      {enabled && query.isLoading && <Typography color="text.secondary" sx={{ p: 2.5 }}>
        Loading latest transactions…
      </Typography>}
      {enabled && query.isError && <Alert severity="warning" sx={{ m: 2 }}>
        Live transaction updates are temporarily unavailable.
      </Alert>}
      {enabled && !query.isLoading && !query.isError && !latest.length &&
        <Alert severity="info" sx={{ m: 2 }}>No committed transactions yet.</Alert>}
      {latest.map((item, index) => <Box key={item.transactionHash}>
        <CardActionArea className="latest-transaction-row" onClick={() => onSelect(item.status)}>
          <Stack direction="row" alignItems="flex-start" spacing={1.4}>
            <CircleRounded className="transaction-row-dot" />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography fontWeight={800} noWrap>{item.title}</Typography>
                <Typography variant="caption" color="text.secondary" whiteSpace="nowrap">
                  {relativeTime(transactionTime(item))}
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: .8 }}>
                <Chip size="small" label={item.method} />
                <Typography variant="caption" color="text.secondary">
                  {item.status.replaceAll('_', ' ')}
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </CardActionArea>
        {index < latest.length - 1 && <Divider />}
      </Box>)}
    </Box>
  </Card>;
}
