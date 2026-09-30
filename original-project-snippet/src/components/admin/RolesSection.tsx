import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import * as adminService from '../../services/adminService'
import type { AdminRole, RolePayload } from '../../types/admin'
import { ApiError } from '../../services/apiClient'

interface RoleForm {
  code: string
  displayName: string
  description: string
  active: boolean
  syncAssignable: boolean
  manualAssignable: boolean
  pageCodes: string[]
}

const EMPTY_FORM: RoleForm = {
  code: '',
  displayName: '',
  description: '',
  active: true,
  syncAssignable: false,
  manualAssignable: true,
  pageCodes: [],
}

/**
 * Role lifecycle: create, edit (code immutable), deactivate/reactivate,
 * delete (only when nobody holds it — the backend answers 409 otherwise),
 * and the role→page visibility checkboxes. ADMIN sees every page regardless
 * of checkboxes, so its row needs none.
 */
export function RolesSection() {
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [pages, setPages] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ code: string | null; form: RoleForm } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminRole | null>(null)

  const load = useCallback(async () => {
    try {
      setRoles(await adminService.listRoles())
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load roles')
    }
  }, [])

  useEffect(() => {
    void load()
    adminService.listPages().then(setPages).catch(() => setPages({}))
  }, [load])

  function openCreate() {
    setEditing({ code: null, form: { ...EMPTY_FORM } })
  }

  function openEdit(role: AdminRole) {
    setEditing({
      code: role.code,
      form: {
        code: role.code,
        displayName: role.displayName,
        description: role.description ?? '',
        active: role.active,
        syncAssignable: role.syncAssignable,
        manualAssignable: role.manualAssignable,
        pageCodes: [...role.pageCodes],
      },
    })
  }

  async function save() {
    if (!editing) return

    const payload: RolePayload = {
      code: editing.code === null ? editing.form.code.trim() : undefined,
      displayName: editing.form.displayName.trim(),
      description: editing.form.description || null,
      active: editing.form.active,
      syncAssignable: editing.form.syncAssignable,
      manualAssignable: editing.form.manualAssignable,
      pageCodes: editing.form.pageCodes,
    }

    try {
      if (editing.code === null) {
        await adminService.createRole(payload)
      } else {
        await adminService.updateRole(editing.code, payload)
      }
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Saving the role failed')
    }
  }

  async function toggleActive(role: AdminRole) {
    try {
      await adminService.updateRole(role.code, { displayName: role.displayName, active: !role.active })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Updating the role failed')
    }
  }

  async function remove(role: AdminRole) {
    setConfirmDelete(null)
    try {
      await adminService.deleteRole(role.code)
      await load()
    } catch (e) {
      // 409 while anyone holds the role — the message explains what to do.
      setError(e instanceof ApiError ? e.message : 'Deleting the role failed')
    }
  }

  function updateForm(update: Partial<RoleForm>) {
    setEditing(editing ? { ...editing, form: { ...editing.form, ...update } } : null)
  }

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box>
        <Button variant="contained" onClick={openCreate}>
          Create role
        </Button>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Grantable by</TableCell>
              <TableCell>Pages</TableCell>
              <TableCell align="right">Holders</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {roles.map(role => (
              <TableRow key={role.code} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {role.code}
                    {role.system && (
                      <Chip label="system" size="small" sx={{ ml: 1 }} variant="outlined" />
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {role.displayName}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={role.active ? 'active' : 'inactive'}
                    color={role.active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {[role.syncAssignable ? 'CN rule' : null, role.manualAssignable ? 'admin' : null]
                    .filter(Boolean)
                    .join(' + ') || '—'}
                </TableCell>
                <TableCell>
                  {role.code === 'ADMIN'
                    ? 'all pages (always)'
                    : role.pageCodes.length > 0
                      ? role.pageCodes.join(', ')
                      : '—'}
                </TableCell>
                <TableCell align="right">{role.holderCount}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" onClick={() => openEdit(role)}>
                      Edit
                    </Button>
                    <Tooltip title={role.system ? 'System roles stay active' : ''}>
                      <span>
                        <Button
                          size="small"
                          disabled={role.system}
                          onClick={() => void toggleActive(role)}
                        >
                          {role.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip
                      title={
                        role.system
                          ? 'System roles cannot be deleted'
                          : role.holderCount > 0
                            ? 'Held by users — deactivate instead, or revoke the holders first'
                            : ''
                      }
                    >
                      <span>
                        <Button
                          size="small"
                          color="error"
                          disabled={role.system || role.holderCount > 0}
                          onClick={() => setConfirmDelete(role)}
                        >
                          Delete
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {/* create / edit dialog */}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing?.code === null ? 'Create role' : `Edit ${editing?.code}`}</DialogTitle>
        <DialogContent>
          {editing && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Code"
                value={editing.form.code}
                onChange={e => updateForm({ code: e.target.value.toUpperCase() })}
                disabled={editing.code !== null}
                helperText={
                  editing.code !== null
                    ? 'Codes are permanent — they live in tokens, audit rows and page config'
                    : 'UPPER_SNAKE_CASE, e.g. SETTLEMENT'
                }
                fullWidth
              />
              <TextField
                label="Display name"
                value={editing.form.displayName}
                onChange={e => updateForm({ displayName: e.target.value })}
                required
                fullWidth
              />
              <TextField
                label="Description"
                value={editing.form.description}
                onChange={e => updateForm({ description: e.target.value })}
                multiline
                minRows={2}
                fullWidth
              />
              <Stack direction="row" spacing={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editing.form.syncAssignable}
                      disabled={editing.code === 'ADMIN'}
                      onChange={e => updateForm({ syncAssignable: e.target.checked })}
                    />
                  }
                  label="Grantable by CN rule"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={editing.form.manualAssignable}
                      onChange={e => updateForm({ manualAssignable: e.target.checked })}
                    />
                  }
                  label="Grantable by admins"
                />
              </Stack>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Visible pages
                </Typography>
                {editing.code === 'ADMIN' ? (
                  <Typography variant="body2" color="text.secondary">
                    ADMIN always sees every page; there is nothing to configure.
                  </Typography>
                ) : (
                  <FormGroup>
                    {Object.entries(pages).map(([code, label]) => (
                      <FormControlLabel
                        key={code}
                        control={
                          <Checkbox
                            checked={editing.form.pageCodes.includes(code)}
                            onChange={e =>
                              updateForm({
                                pageCodes: e.target.checked
                                  ? [...editing.form.pageCodes, code]
                                  : editing.form.pageCodes.filter(c => c !== code),
                              })
                            }
                          />
                        }
                        label={`${label} (${code})`}
                      />
                    ))}
                  </FormGroup>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={
              !editing ||
              !editing.form.displayName.trim() ||
              (editing.code === null && !editing.form.code.trim())
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* delete confirmation */}
      <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete role {confirmDelete?.code}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Deleting removes the role and its CN rules permanently (the audit
            history is kept). If you only want to switch the access off,
            deactivate it instead — that is reversible.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => confirmDelete && void remove(confirmDelete)}>
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
