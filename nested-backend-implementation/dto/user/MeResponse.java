package com.bistech.reporting.dto.auth;

import java.time.Instant;
import java.util.List;

/// GET /api/auth/me — live truth from the database (the token is a snapshot).
public record MeResponse(
        String username,
        String fullName,
        String email,
        String organization,
        String employeeId,
        Instant lastLoggedIn,
        List<String> roles,
        List<String> pages
) {
}
