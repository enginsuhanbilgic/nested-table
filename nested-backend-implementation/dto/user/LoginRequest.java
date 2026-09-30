package com.bistech.reporting.dto.auth;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank String username,
        @NotBlank String password,
        String captchaId,
        String answer
) {
}
