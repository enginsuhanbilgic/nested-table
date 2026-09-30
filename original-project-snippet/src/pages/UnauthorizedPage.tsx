import { Box, Button, Paper, Typography } from '@mui/material'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import { useNavigate } from 'react-router-dom'

export function UnauthorizedPage() {
  const navigate = useNavigate()

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 420, textAlign: 'center' }}>
        <BlockRoundedIcon color="error" sx={{ fontSize: 48, mb: 1 }} />
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
          No access to this page
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Your account does not have a role that can see this page. Access is
          granted by an administrator and takes effect within a few minutes.
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Back to the app
        </Button>
      </Paper>
    </Box>
  )
}
