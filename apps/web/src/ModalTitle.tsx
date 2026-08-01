import { CloseRounded } from '@mui/icons-material';
import { DialogTitle, IconButton } from '@mui/material';
import { ReactNode } from 'react';

export function ModalTitle({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <DialogTitle sx={{ pr: 7 }}>
    {children}
    <IconButton
      aria-label="Close dialog"
      onClick={onClose}
      sx={{ position: 'absolute', right: 12, top: 10 }}
    >
      <CloseRounded />
    </IconButton>
  </DialogTitle>;
}
