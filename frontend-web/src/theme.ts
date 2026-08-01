import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    background: { default: '#f5f7fb', paper: '#ffffff' },
    primary: { main: '#5b4bdb', dark: '#4033b5', light: '#eeebff' },
    secondary: { main: '#087f68', dark: '#056653', light: '#dff8f1' },
    warning: { main: '#b76e00' },
    error: { main: '#c83c52' },
    text: { primary: '#172033', secondary: '#637083' },
    divider: '#e6eaf0'
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    h1: { fontWeight: 780, letterSpacing: '-0.04em' },
    h2: { fontWeight: 720, letterSpacing: '-0.035em' },
    button: { textTransform: 'none', fontWeight: 700 }
  },
  shape: { borderRadius: 14 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #e6eaf0',
          backgroundImage: 'none',
          boxShadow: '0 8px 28px rgba(32, 45, 70, .06)'
        }
      }
    },
    MuiButton: { styleOverrides: { root: { borderRadius: 10, minHeight: 42 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 650 } } }
  }
});
