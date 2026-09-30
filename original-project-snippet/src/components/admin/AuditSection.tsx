import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material'
import * as adminService from '../../services/adminService'
import type { AuditEntry } from '../../types/admin'
import { ApiError } from '../../services/apiClient'

const ACTION_COLORS: Record<string, 'success' | 'error' | 'info' | 'default'> = {
  GRANT: 'success',
  REVOKE: 'error',
  ROLE_CREATE: 'info',
  ROLE_UPDATE: 'info',
  ROLE_DELETE: 'error',
  RULE_CREATE: 'info',
  RULE_UPDATE: 'info',
  RULE_DELETE: 'error',
}

/** Read-only, append-only history: who granted/revoked/changed what, when. */
export function AuditSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await adminService.listAudit(page, size)
      setEntries(result.content)
      setTotal(result.totalElements)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load the audit log')
    }
  }, [page, size])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>By</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Detail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map(entry => (
              <TableRow key={entry.id} hover>
                <TableCell>{new Date(entry.happenedAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Chip
                    label={entry.action}
                    size="small"
                    color={ACTION_COLORS[entry.action] ?? 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{entry.actor}</TableCell>
                <TableCell>{entry.username ?? '—'}</TableCell>
                <TableCell>{entry.roleCode ?? '—'}</TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {entry.detail ?? ''}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    Nothing recorded yet.
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
        rowsPerPageOptions={[25, 50, 100]}
      />
    </Paper>
  )
}
