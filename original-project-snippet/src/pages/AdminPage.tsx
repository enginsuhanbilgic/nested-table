import { useState } from 'react'
import { Box, Paper, Tab, Tabs } from '@mui/material'
import { UsersSection } from '../components/admin/UsersSection'
import { RolesSection } from '../components/admin/RolesSection'
import { CnRulesSection } from '../components/admin/CnRulesSection'
import { AuditSection } from '../components/admin/AuditSection'

/**
 * The one admin page: manual role grants, role lifecycle + page visibility,
 * CN rules, and the audit trail. Every change here reaches affected users
 * within one access-token lifetime (~15 min) — no redeploys.
 */
export function AdminPage() {
  const [tab, setTab] = useState(0)

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
      <Paper sx={{ px: 2 }}>
        <Tabs value={tab} onChange={(_e, value: number) => setTab(value)}>
          <Tab label="Users" />
          <Tab label="Roles" />
          <Tab label="CN Rules" />
          <Tab label="Audit" />
        </Tabs>
      </Paper>

      {tab === 0 && <UsersSection />}
      {tab === 1 && <RolesSection />}
      {tab === 2 && <CnRulesSection />}
      {tab === 3 && <AuditSection />}
    </Box>
  )
}
