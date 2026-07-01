import { createTheme } from '@mui/material/styles';

/** Compact, light theme for a dense dashboard. */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2563eb', contrastText: '#ffffff' },
    secondary: { main: '#0891b2' },
    success: { main: '#16a34a' },
    warning: { main: '#d97706' },
    error: { main: '#dc2626' },
    background: { default: '#eef3f8', paper: '#ffffff' },
    text: { primary: '#1f2937', secondary: '#64748b' },
    divider: '#d8e1ec',
  },
  typography: {
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
    fontSize: 13,
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: 11,
          fontWeight: 600,
        },
      },
    },
  },
});
