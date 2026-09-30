package com.bistech.reporting.exception;

/// The request is well-formed but refused against the CURRENT state — 409,
/// not 400, on purpose: revoking your own ADMIN, revoking the last ADMIN,
/// deleting a role someone still holds, deactivating a system role.
public class RoleManagementConflictException extends RuntimeException {

    public RoleManagementConflictException(final String message) {
        super(message);
    }
}
