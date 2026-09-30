import { useState } from 'react'
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded'
import { useLocation } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { useAuth } from '../../contexts/AuthContext'
import { useThemeMode } from '../../contexts/ThemeModeContext'
import { findRouteMeta } from '../../routes/routeMeta'

function getInitials(fullName?: string) {
  if (!fullName) return 'U'
  return fullName
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

interface TopBarProps {
  mobileNavOpen: boolean
  onMobileNavToggle: () => void
  onToggleFullscreen: () => void
}

export function TopBar({ mobileNavOpen, onMobileNavToggle, onToggleFullscreen }: TopBarProps) {
  const theme = useTheme()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { mode, toggleTheme } = useThemeMode()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const isMenuOpen = Boolean(anchorEl)

  const routeMeta = findRouteMeta(location.pathname)

  function handleProfileClick(event: React.MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget)
  }

  function handleMenuClose() {
    setAnchorEl(null)
  }

  function handleLogout() {
    handleMenuClose()
    logout()
  }

  return (
    <AppBar
      position="sticky"
      sx={{
        top: 0,
        zIndex: theme.zIndex.drawer + 1,
        bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.78 : 0.88),
        color: 'text.primary',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        // 67 content + the theme's 1px AppBar borderBottom = 68 total, so the
        // shell's calc(100vh - 68px) is exact. (minHeight 68 made the bar
        // 69px tall and forced a permanent 1px page scrollbar.)
        sx={{ minHeight: 67, px: { xs: 1.5, md: 3 }, gap: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0, flex: 1 }}>
          {/* Mobile-only: toggles the full-screen nav overlay */}
          <IconButton
            onClick={onMobileNavToggle}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          >
            {mobileNavOpen ? <CloseRoundedIcon /> : <MenuRoundedIcon />}
          </IconButton>

          <Box sx={{ flex: '0 0 auto', display: { xs: 'none', sm: 'block' } }}>
            <BrandMark />
          </Box>

          {routeMeta && (
            <>
              <Divider
                orientation="vertical"
                sx={{ height: 24, display: { xs: 'none', sm: 'block' } }}
              />
              <Typography noWrap sx={{ fontWeight: 800, fontSize: 15, minWidth: 0 }}>
                {routeMeta.title}
              </Typography>
            </>
          )}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Tooltip title="Fullscreen (Esc to exit)">
            <IconButton onClick={onToggleFullscreen} aria-label="Enter fullscreen">
              <FullscreenRoundedIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
            <IconButton onClick={toggleTheme} aria-label="Toggle theme">
              {mode === 'light' ? <DarkModeRoundedIcon /> : <LightModeRoundedIcon />}
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

          <Box
            component="button"
            type="button"
            onClick={handleProfileClick}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            sx={{
              border: 0,
              bgcolor: 'transparent',
              color: 'text.primary',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.75,
              borderRadius: 3,
              cursor: 'pointer',
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            <Avatar
              sx={theme => ({
                width: 34,
                height: 34,
                fontSize: 13,
                fontWeight: 900,
                bgcolor: alpha(theme.palette.primary.main, 0.16),
                color: 'primary.main',
                border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
              })}
            >
              {getInitials(user?.fullName)}
            </Avatar>

            <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left', minWidth: 0, maxWidth: 180 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 900, lineHeight: 1.15 }}>
                {user?.fullName ?? 'Unknown user'}
              </Typography>
              <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.15, fontWeight: 700 }}>
                {user?.organization ?? 'No organization'}
              </Typography>
            </Box>

            <KeyboardArrowDownRoundedIcon fontSize="small" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }} />
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={isMenuOpen}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{ sx: { mt: 1, minWidth: 290 } }}
          >
            <Box sx={{ px: 1.5, py: 1.25 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  sx={theme => ({
                    width: 44,
                    height: 44,
                    fontWeight: 900,
                    bgcolor: alpha(theme.palette.primary.main, 0.16),
                    color: 'primary.main',
                  })}
                >
                  {getInitials(user?.fullName)}
                </Avatar>

                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap sx={{ fontWeight: 900 }}>
                    {user?.fullName ?? 'Unknown user'}
                  </Typography>
                  <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary', fontWeight: 700 }}>
                    {user?.email ?? 'No email'}
                  </Typography>
                  <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
                    ID: {user?.employeeId || '-'} · {user?.roles.join(', ') || 'No roles'}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Divider sx={{ my: 1 }} />

            <MenuItem onClick={handleMenuClose}>
              <PersonRoundedIcon sx={{ fontSize: 20, mr: 1.25 }} />
              My profile
            </MenuItem>

            <Divider sx={{ my: 1 }} />

            <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
              <LogoutRoundedIcon sx={{ fontSize: 20, mr: 1.25 }} />
              Sign out
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>
    </AppBar>
  )
}
