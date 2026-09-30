import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded'
import * as adminService from '../../services/adminService'
import type { AdminRole, AdminUser } from '../../types/admin'
import { ApiError } from '../../services/apiClient'

/**
 * Search users; grant/revoke MANUAL roles via the chips. SYNC chips (from
 * LDAP CN rules) are shown but not deletable — those come and go with the
 * directory groups and the CN rules, not with admin clicks.
 */
export function UsersSection() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [error, setError] = useState<string | null>(null)
  const [grantMenu, setGrantMenu] = useState<{ anchor: HTMLElement; user: AdminUser } | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [search])

  const load = useCallback(async () => {
    try {
      const result = await adminService.listUsers(debouncedSearch, page, size)
      setUsers(result.content)
      setTotal(result.totalElements)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load users')
    }
  }, [debouncedSearch, page, size])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    adminService.listRoles().then(setRoles).catch(() => setRoles([]))
  }, [])

  async function handleGrant(user: AdminUser, roleCode: string) {
    setGrantMenu(null)
    try {
      await adminService.grantRole(user.id, roleCode)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Grant failed')
    }
  }

  async function handleRevoke(user: AdminUser, roleCode: string) {
    try {
      const result = await adminService.revokeRole(user.id, roleCode)
      if (result.stillSyncAssigned) {
        setError(
          `Manual grant of ${roleCode} removed, but an LDAP group still grants it — ` +
            'edit the CN rules to withdraw it completely.',
        )
      } else {
        setError(null)
      }
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Revoke failed')
    }
  }

  const grantableRoles = (user: AdminUser) =>
    roles.filter(
      role =>
        role.active &&
        role.manualAssignable &&
        !user.assignments.some(a => a.roleCode === role.code && a.source === 'MANUAL'),
    )

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TextField
        label="Search username, full name or employee id"
        value={search}
        onChange={e => setSearch(e.target.value)}
        size="small"
        sx={{ maxWidth: 420 }}
      />

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Organization</TableCell>
              <TableCell>Last login</TableCell>
              <TableCell>Roles</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {user.fullName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.username}
                  </Typography>
                </TableCell>
                <TableCell>{user.organization ?? '—'}</TableCell>
                <TableCell>
                  {user.lastLoggedIn ? new Date(user.lastLoggedIn).toLocaleString() : '—'}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center">
                    {user.assignments.map(assignment => (
                      <Tooltip
                        key={`${assignment.roleCode}-${assignment.source}`}
                        title={
                          assignment.source === 'MANUAL'
                            ? `Granted by ${assignment.grantedBy ?? '?'} — click × to revoke`
                            : 'Granted automatically by an LDAP CN rule'
                        }
                      >
                        <Chip
                          label={assignment.roleCode}
                          size="small"
                          color={assignment.source === 'MANUAL' ? 'primary' : 'default'}
                          variant={assignment.source === 'MANUAL' ? 'filled' : 'outlined'}
                          onDelete={
                            assignment.source === 'MANUAL'
                              ? () => void handleRevoke(user, assignment.roleCode)
                              : undefined
                          }
                        />
                      </Tooltip>
                    ))}
                    <Tooltip title="Grant a role">
                      <IconButton
                        size="small"
                        onClick={e => setGrantMenu({ anchor: e.currentTarget, user })}
                        aria-label={`Grant a role to ${user.username}`}
                      >
                        <AddCircleOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No users found. Users appear here after their first login.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={size}
        onPageChange={(_e, newPage) => setPage(newPage)}
        onRowsPerPageChange={e => {
          setSize(parseInt(e.target.value, 10))
          setPage(0)
        }}
        rowsPerPageOptions={[10, 20, 50]}
      />

      <Menu
        anchorEl={grantMenu?.anchor ?? null}
        open={grantMenu !== null}
        onClose={() => setGrantMenu(null)}
      >
        {grantMenu && grantableRoles(grantMenu.user).length === 0 && (
          <MenuItem disabled>No grantable roles left</MenuItem>
        )}
        {grantMenu &&
          grantableRoles(grantMenu.user).map(role => (
            <MenuItem key={role.code} onClick={() => void handleGrant(grantMenu.user, role.code)}>
              {role.code} — {role.displayName}
            </MenuItem>
          ))}
      </Menu>
    </Paper>
  )
}
