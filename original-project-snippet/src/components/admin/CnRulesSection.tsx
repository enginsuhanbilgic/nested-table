import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import * as adminService from '../../services/adminService'
import type { AdminRole, CnMatchMode, CnRule } from '../../types/admin'
import { ApiError } from '../../services/apiClient'

interface RuleForm {
  roleCode: string
  cnValue: string
  matchMode: CnMatchMode
  active: boolean
  description: string
}

const EMPTY_FORM: RuleForm = {
  roleCode: '',
  cnValue: '',
  matchMode: 'EXACT',
  active: true,
  description: '',
}

/**
 * "Users in this LDAP group automatically get this role." Read fresh from
 * the DB at every login and refresh, so edits act within ~15 minutes.
 * The normalized key column is deliberate: a rule that never matches
 * produces no error anywhere — the key is how you diagnose it.
 */
export function CnRulesSection() {
  const [rules, setRules] = useState<CnRule[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: number | null; form: RuleForm } | null>(null)

  const load = useCallback(async () => {
    try {
      setRules(await adminService.listCnRules())
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load CN rules')
    }
  }, [])

  useEffect(() => {
    void load()
    adminService.listRoles().then(setRoles).catch(() => setRoles([]))
  }, [load])

  // ADMIN is never in this list: it is not sync-assignable, by design.
  const targetRoles = roles.filter(role => role.syncAssignable && role.active)

  async function save() {
    if (!editing) return

    const payload = {
      roleCode: editing.form.roleCode,
      cnValue: editing.form.cnValue.trim(),
      matchMode: editing.form.matchMode,
      active: editing.form.active,
      description: editing.form.description || null,
    }

    try {
      if (editing.id === null) {
        await adminService.createCnRule(payload)
      } else {
        await adminService.updateCnRule(editing.id, payload)
      }
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Saving the rule failed')
    }
  }

  async function remove(rule: CnRule) {
    try {
      await adminService.deleteCnRule(rule.id)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Deleting the rule failed')
    }
  }

  function updateForm(update: Partial<RuleForm>) {
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
        <Button variant="contained" onClick={() => setEditing({ id: null, form: { ...EMPTY_FORM } })}>
          Create rule
        </Button>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Group CN (as typed)</TableCell>
              <TableCell>Matching key</TableCell>
              <TableCell>Mode</TableCell>
              <TableCell>Grants role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Updated</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map(rule => (
              <TableRow key={rule.id} hover>
                <TableCell>{rule.cnValue}</TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {rule.cnKey}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={rule.matchMode} size="small" variant="outlined" />
                </TableCell>
                <TableCell>{rule.roleCode}</TableCell>
                <TableCell>
                  <Chip
                    label={rule.active ? 'active' : 'inactive'}
                    color={rule.active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {rule.updatedBy}
                    <br />
                    {new Date(rule.updatedAt).toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      size="small"
                      onClick={() =>
                        setEditing({
                          id: rule.id,
                          form: {
                            roleCode: rule.roleCode,
                            cnValue: rule.cnValue,
                            matchMode: rule.matchMode,
                            active: rule.active,
                            description: rule.description ?? '',
                          },
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button size="small" color="error" onClick={() => void remove(rule)}>
                      Delete
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No CN rules. Users only receive the default role until a rule is created.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing?.id === null ? 'Create CN rule' : 'Edit CN rule'}</DialogTitle>
        <DialogContent>
          {editing && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="LDAP group CN"
                value={editing.form.cnValue}
                onChange={e => updateForm({ cnValue: e.target.value })}
                helperText="Type it as it appears in the directory. Capitalization and Turkish İ/ı are handled automatically."
                required
                fullWidth
              />
              <TextField
                select
                label="Grants role"
                value={editing.form.roleCode}
                onChange={e => updateForm({ roleCode: e.target.value })}
                helperText="Only roles marked 'grantable by CN rule' are listed — ADMIN never is."
                required
                fullWidth
              >
                {targetRoles.map(role => (
                  <MenuItem key={role.code} value={role.code}>
                    {role.code} — {role.displayName}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Match mode"
                value={editing.form.matchMode}
                onChange={e => updateForm({ matchMode: e.target.value as CnMatchMode })}
                helperText="EXACT is safer. CONTAINS matches any group whose name includes the text — a short value can over-match."
                fullWidth
              >
                <MenuItem value="EXACT">EXACT</MenuItem>
                <MenuItem value="CONTAINS">CONTAINS</MenuItem>
              </TextField>
              <TextField
                label="Description"
                value={editing.form.description}
                onChange={e => updateForm({ description: e.target.value })}
                multiline
                minRows={2}
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editing.form.active}
                    onChange={e => updateForm({ active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={!editing || !editing.form.cnValue.trim() || !editing.form.roleCode}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
