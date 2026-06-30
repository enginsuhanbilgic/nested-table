import { createTheme } from '@mui/material/styles';

/** Compact, light theme for a dense dashboard. */
export const theme = createTheme({
  palette: { mode: 'light', background: { default: '#f5f6f8' } },
  typography: {
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
    fontSize: 13,
  },
  shape: { borderRadius: 8 },
});
