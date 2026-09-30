package com.bistech.reporting.dto.auth;

/// The refresh token appears here exactly once — only its hash is stored.
public record TokenPairResponse(
        String accessToken,
        String refreshToken,
        SessionUserResponse user
) {
}
