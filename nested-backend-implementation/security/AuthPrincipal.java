package com.bistech.reporting.security;

import com.bistech.reporting.model.user.RoleCodes;

import java.util.List;
import java.util.UUID;

/// The authenticated principal, built entirely from access-token claims —
/// no database involved on the request path. Available in controllers via
/// @AuthenticationPrincipal (whole record, or expression = "userId" /
/// "username" for a single field).
///
/// userId is the stat.lr_users primary key, carried in the token so handlers
/// that key their data on the user (transaction history, page tracking) need
/// no per-request lookup.
public record AuthPrincipal(
        UUID userId,
        String username,
        String fullName,
        List<String> roles,
        List<String> pages
) {
    public boolean isAdmin() {
        return roles != null && roles.contains(RoleCodes.ADMIN);
    }
}
