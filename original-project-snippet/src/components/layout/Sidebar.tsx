import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import { motion } from 'framer-motion'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ROUTE_META, type RouteMeta } from '../../routes/routeMeta'

export const SIDEBAR_WIDTH_EXPANDED = 280
export const SIDEBAR_WIDTH_COLLAPSED = 82
export const SIDEBAR_TRANSITION_MS = 280

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const theme = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const { hasAnyRole } = useAuth()

  // Only show items the user is allowed to open, instead of letting the
  // route guard bounce them to /unauthorized after the click.
  const canSee = (item: RouteMeta) => !item.roles || hasAnyRole(item.roles)
  const primaryNavItems = ROUTE_META.filter(
    item => item.section === 'primary' && canSee(item),
  )
  const operationNavItems = ROUTE_META.filter(
    item => item.section === 'operation' && canSee(item),
  )

  const isSelected = (item: RouteMeta) =>
    Boolean(
      matchPath({ path: item.path, end: item.end ?? false }, location.pathname),
    )

  const drawerWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
  const transition = theme.transitions.create(['width', 'padding', 'margin'], {
    duration: SIDEBAR_TRANSITION_MS,
    easing: theme.transitions.easing.easeInOut,
  })

  const labelMotion = {
    initial: false,
    animate: {
      opacity: 1,
      x: 0,
      width: collapsed ? 0 : 'auto',
    },
    transition: {
      duration: 0.22,
      ease: [0.4, 0, 0.2, 1],
    },
  } as const

  function renderNavItem(item: RouteMeta) {
    const selected = isSelected(item)

    const button = (
      <ListItemButton
        selected={selected}
        onClick={() => navigate(item.path)}
        sx={{
          minHeight: 46,
          mx: 1,
          my: 0.25,
          justifyContent: 'flex-start',
          px: 1.25,
          borderRadius: 2.5,
          transition,
          overflow: 'hidden',
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 0,
            width: 44,
            mr: 1.25,
            justifyContent: 'center',
            color: selected ? 'primary.main' : 'text.secondary',
            transition,
          }}
        >
          {item.icon}
        </ListItemIcon>

        <Box
          component={motion.div}
          {...labelMotion}
          sx={{
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <ListItemText
            primary={item.label}
            primaryTypographyProps={{
              fontWeight: selected ? 900 : 700,
              fontSize: 14,
              noWrap: true,
            }}
          />
        </Box>

        <Box
          component={motion.div}
          {...labelMotion}
          sx={{ display: 'flex', overflow: 'hidden' }}
        >
          {item.badge && (
            <Chip
              label={item.badge}
              color="error"
              size="small"
              sx={{ height: 20, minWidth: 24 }}
            />
          )}
        </Box>
      </ListItemButton>
    )

    return collapsed ? (
      <Tooltip key={item.path} title={item.label} placement="right">
        {button}
      </Tooltip>
    ) : (
      <Box key={item.path}>{button}</Box>
    )
  }

  // Mobile items are always expanded and close the drawer on navigation.
  function renderMobileNavItem(item: RouteMeta) {
    const selected = isSelected(item)

    return (
      <ListItemButton
        key={item.path}
        selected={selected}
        onClick={() => {
          navigate(item.path)
          onMobileClose()
        }}
        sx={{
          minHeight: 52,
          mx: 1.5,
          my: 0.25,
          px: 1.5,
          borderRadius: 2.5,
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 0,
            width: 44,
            mr: 1.25,
            justifyContent: 'center',
            color: selected ? 'primary.main' : 'text.secondary',
          }}
        >
          {item.icon}
        </ListItemIcon>

        <ListItemText
          primary={item.label}
          primaryTypographyProps={{
            fontWeight: selected ? 900 : 700,
            fontSize: 15,
            noWrap: true,
          }}
        />

        {item.badge && (
          <Chip
            label={item.badge}
            color="error"
            size="small"
            sx={{ height: 20, minWidth: 24 }}
          />
        )}
      </ListItemButton>
    )
  }

  return (
    <>
      {/* Desktop: permanent, collapsible rail */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          transition,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            top: 68,
            height: 'calc(100vh - 68px)',
            overflowX: 'hidden',
            transition,
          },
        }}
      >
        <Stack sx={{ height: '100%', py: 1.5 }}>
          <Box
            sx={{
              minHeight: 42,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              px: 1.5,
              pb: 1,
            }}
          >
            <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
              <IconButton
                size="small"
                onClick={onToggle}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                sx={{
                  bgcolor: 'action.hover',
                  '&:hover': {
                    bgcolor: 'action.selected',
                  },
                }}
              >
                {collapsed ? <ChevronRightRoundedIcon /> : <ChevronLeftRoundedIcon />}
              </IconButton>
            </Tooltip>
          </Box>

          <Divider />

          <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5 }}>
            <List dense disablePadding>
              {primaryNavItems.map(renderNavItem)}
            </List>
          </Box>

          {operationNavItems.length > 0 && (
            <>
              <Divider />

              <Box sx={{ py: 1.25 }}>
                <Box
                  component={motion.div}
                  {...labelMotion}
                  style={{ overflow: 'hidden' }}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      display: 'block',
                      px: 2.75,
                      color: 'text.secondary',
                      fontWeight: 900,
                      letterSpacing: '0.12em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Operation
                  </Typography>
                </Box>

                <List dense disablePadding>
                  {operationNavItems.map(renderNavItem)}
                </List>
              </Box>
            </>
          )}
        </Stack>
      </Drawer>

      {/* Mobile: full-screen overlay under the TopBar, toggled from its
          hamburger. Rendered through a portal, so it never occupies a slot
          in the AppShell grid. */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          // Below the TopBar (drawer + 1) so the bar and its close button
          // stay visible and clickable above the overlay.
          zIndex: theme.zIndex.drawer,
        }}
        PaperProps={{
          sx: {
            width: '100%',
            top: 68,
            height: 'calc(100vh - 68px)',
            borderRight: 0,
          },
        }}
      >
        <Stack sx={{ height: '100%', py: 1 }}>
          <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
            <List disablePadding>
              {primaryNavItems.map(renderMobileNavItem)}
            </List>
          </Box>

          {operationNavItems.length > 0 && (
            <>
              <Divider />

              <Box sx={{ py: 1.25 }}>
                <Typography
                  variant="overline"
                  sx={{
                    display: 'block',
                    px: 3,
                    color: 'text.secondary',
                    fontWeight: 900,
                    letterSpacing: '0.12em',
                  }}
                >
                  Operation
                </Typography>

                <List disablePadding>
                  {operationNavItems.map(renderMobileNavItem)}
                </List>
              </Box>
            </>
          )}
        </Stack>
      </Drawer>
    </>
  )
}
