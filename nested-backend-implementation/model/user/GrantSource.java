package com.bistech.reporting.model.user;

/// Where a role assignment came from. SYNC rows are owned by the LDAP
/// synchronizer (login + refresh); MANUAL rows are owned by administrators.
/// The two sources never share a row.
public enum GrantSource {
    SYNC,
    MANUAL
}
