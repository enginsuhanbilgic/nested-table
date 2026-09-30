package com.bistech.reporting.model.user;

import java.util.Set;

/// The only role codes the application refers to by name. Everything else
/// (TRANSACTION, ANALYTICS, future roles) is pure data: created in the admin
/// UI, granted by CN rule or by hand, mapped to pages — zero code involved.
public final class RoleCodes {

    /// Granted automatically to every authenticated user during sync.
    public static final String STANDARD_USER = "STANDARD_USER";

    /// Gates /api/admin/** and bypasses page checks. Never sync-assignable:
    /// no LDAP rule can ever mint an administrator.
    public static final String ADMIN = "ADMIN";

    /// Must exist in stat.lr_roles or the application refuses to boot.
    public static final Set<String> REQUIRED = Set.of(STANDARD_USER, ADMIN);

    /// Cannot be deactivated or deleted from the admin API.
    public static final Set<String> SYSTEM_ROLES = Set.of(STANDARD_USER, ADMIN);

    private RoleCodes() {
    }
}
