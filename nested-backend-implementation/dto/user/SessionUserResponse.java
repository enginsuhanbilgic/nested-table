package com.bistech.reporting.dto.auth;

import java.util.List;

/// The session identity the frontend gates on: returned by login and refresh,
/// always consistent with the access token issued next to it. Profile fields
/// ride along in the response body only — they are NOT token claims.
public record SessionUserResponse(
        String username,
        String fullName,
        String email,
        String organization,
        String employeeId,
        List<String> roles,
        List<String> pages
) {
}
