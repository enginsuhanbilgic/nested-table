package com.bistech.reporting.dto.auth;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/// One row of the admin page's user list.
public record UserSummaryResponse(
        UUID id,
        String username,
        String fullName,
        String organization,
        String email,
        Instant lastLoggedIn,
        List<RoleAssignmentResponse> assignments
) {
}
