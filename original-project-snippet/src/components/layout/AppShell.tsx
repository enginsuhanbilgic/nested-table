import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Box, useTheme, IconButton, Tooltip } from '@mui/material'
import { alpha } from '@mui/material/styles'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import { Sidebar, SIDEBAR_TRANSITION_MS, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from './Sidebar'
import { TopBar } from './TopBar'
import { SidebarContext } from '../../contexts/SidebarContext'

// Same persistence pattern as ThemeModeContext's 'lr.theme.mode'.
const SIDEBAR_STORAGE_KEY = 'lr.sidebar.collapsed'

function getInitialCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
}

export function AppShell() {
  const theme = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialCollapsed)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED

  function toggleSidebar() {
    const next = !sidebarCollapsed
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
    setSidebarCollapsed(next)
  }

  function toggleFullscreen() { setIsFullscreen(value => !value) }

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  return (
    <SidebarContext.Provider value={{ collapsed: sidebarCollapsed }}>
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          position: 'relative',
        }}
      >
        {/* Entering fullscreen lives in the TopBar. While it's hidden, the
            exit control is a glowing "dent" on the top edge at 3/4 of the
            width: only a thin lip of the button peeks out until the pointer
            comes near, then it slides fully out. Esc still exits too. */}
        {isFullscreen && (
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: '75%',
              transform: 'translateX(-50%)',
              zIndex: 2000,
              display: 'flex',
              justifyContent: 'center',
              // The wrapper never intercepts the pointer — only the thin
              // top-edge trigger strip and the button itself do — so the
              // filter bar under this spot stays fully hover/clickable.
              pointerEvents: 'none',
              '&:hover .fullscreen-exit-tab, &:focus-within .fullscreen-exit-tab':
                {
                  transform: 'translateY(0)',
                },
            }}
          >
            {/* "Hover near" zone: a strip flush with the screen's top edge.
                Content starts 16px down (main's padding), so this strip
                never sits over a control. */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 140,
                height: 12,
                pointerEvents: 'auto',
              }}
            />
            <Tooltip title="Exit fullscreen (Esc)" placement="bottom">
              <IconButton
                className="fullscreen-exit-tab"
                onClick={toggleFullscreen}
                aria-label="Exit fullscreen"
                sx={{
                  pointerEvents: 'auto',
                  width: 52,
                  height: 40,
                  borderRadius: '0 0 14px 14px',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  boxShadow: `0 0 16px ${alpha(theme.palette.primary.main, 0.65)}`,
                  // Retracted: only the bottom 9px peeks out as the dent.
                  transform: 'translateY(calc(9px - 100%))',
                  transition: theme.transitions.create('transform', {
                    duration: 180,
                    easing: theme.transitions.easing.easeInOut,
                  }),
                  '&:hover': {
                    bgcolor: 'primary.dark',
                    transform: 'translateY(0)',
                  },
                  '&:focus-visible': {
                    transform: 'translateY(0)',
                  },
                }}
              >
                <FullscreenExitIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {!isFullscreen && (
          <TopBar
            mobileNavOpen={mobileNavOpen}
            onMobileNavToggle={() => setMobileNavOpen(value => !value)}
            onToggleFullscreen={toggleFullscreen}
          />
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: isFullscreen
              ? 'minmax(0, 1fr)'
              : { xs: 'minmax(0, 1fr)', md: `${sidebarWidth}px minmax(0, 1fr)` },
            minHeight: isFullscreen ? '100vh' : 'calc(100vh - 68px)',
            transition: theme.transitions.create('grid-template-columns', {
              duration: SIDEBAR_TRANSITION_MS,
              easing: theme.transitions.easing.easeInOut,
            }),
          }}
        >
          {!isFullscreen && (
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={toggleSidebar}
              mobileOpen={mobileNavOpen}
              onMobileClose={() => setMobileNavOpen(false)}
            />
          )}

          <Box
            component="main"
            sx={{
              minWidth: 0,
              width: '100%',
              minHeight: isFullscreen ? '100vh' : 'calc(100vh - 68px)',
              overflowX: 'hidden',
              px: { xs: 1, md: 2 },
              py: { xs: 1, md: 2 },
            }}
          >
            <Outlet />
          </Box>
        </Box>
      </Box>
    </SidebarContext.Provider>
  )
}
