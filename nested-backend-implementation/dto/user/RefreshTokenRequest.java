package com.bistech.reporting.dto.auth;

import jakarta.validation.constraints.NotBlank;

/// Body of POST /api/auth/refresh and POST /api/auth/logout.
public record RefreshTokenRequest(
        @NotBlank String refreshToken
) {
}
