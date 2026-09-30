package com.bistech.reporting.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Set;

/// Create/update payload for a role. On update the code is ignored — role
/// codes are immutable (they live in tokens, audit rows and page config).
public record RoleRequest(
        @Pattern(regexp = "[A-Z][A-Z0-9_]{1,49}",
                message = "code must be UPPER_SNAKE_CASE, 2-50 chars")
        String code,

        @NotBlank @Size(max = 255)
        String displayName,

        @Size(max = 500)
        String description,

        Boolean active,
        Boolean syncAssignable,
        Boolean manualAssignable,
        Set<String> pageCodes
) {
}
