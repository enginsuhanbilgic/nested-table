package com.bistech.reporting.dto.auth;

/// Result of DELETE /users/{id}/roles/{code}. stillSyncAssigned lets the UI
/// explain "the manual grant is gone, but an LDAP group still grants this".
public record ManualRevokeResponse(
        String roleCode,
        boolean manualRemoved,
        boolean stillSyncAssigned
) {
}
