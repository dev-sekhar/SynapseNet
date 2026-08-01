import { ContentCopyRounded } from '@mui/icons-material';
import {
  Alert, Box, Chip, IconButton, Link, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tooltip, Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getTransactions } from './api';

function short(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function age(timestamp: string) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function TransactionScan({ status }: { status?: string }) {
  const query = useQuery({
    queryKey: ['credential-transactions', status],
    queryFn: () => getTransactions(status)
  });

  if (query.isLoading) return <Typography color="text.secondary">Loading committed transactions…</Typography>;
  if (query.isError) return <Alert severity="error">The ledger transaction index could not be loaded.</Alert>;
  const page = query.data!;
  return <>
    {!page.indexing.ready && <Alert severity="warning" sx={{ mb: 2 }}>
      The peer event index is reconnecting. Some recent transactions may appear shortly.
    </Alert>}
    <TableContainer className="transaction-scan">
      <Table size="small" aria-label="Credential ledger transactions">
        <TableHead><TableRow>
          {['Transaction Hash', 'Method', 'Block', 'Age', 'From', 'To', 'Credential', 'Status'].map(label =>
            <TableCell key={label}>{label}</TableCell>)}
        </TableRow></TableHead>
        <TableBody>{page.items.map(item => <TableRow hover key={item.transactionHash}>
          <TableCell><Box sx={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
            <Link component="button" underline="hover" title={item.transactionHash}>{short(item.transactionHash)}</Link>
            <Tooltip title="Copy transaction hash"><IconButton size="small"
              onClick={() => navigator.clipboard.writeText(item.transactionHash)}>
              <ContentCopyRounded sx={{ fontSize: 14 }} />
            </IconButton></Tooltip>
          </Box></TableCell>
          <TableCell><Chip size="small" label={item.method} /></TableCell>
          <TableCell>{item.blockNumber}</TableCell>
          <TableCell title={new Date(Number(item.timestamp) * 1000).toLocaleString()}>{age(item.timestamp)}</TableCell>
          <TableCell title={item.from}>{short(item.from)}</TableCell>
          <TableCell title={item.to}>{short(item.to)}</TableCell>
          <TableCell><Typography variant="body2" fontWeight={650}>{item.title}</Typography>
            <Typography variant="caption" color="text.secondary">{item.credentialId ?? item.requestId}</Typography></TableCell>
          <TableCell><Chip size="small" color={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'} label={item.status.replace('_', ' ')} /></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>
    {!page.items.length && <Alert severity="info">No committed transactions match this status.</Alert>}
  </>;
}
