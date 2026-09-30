package com.bistech.reporting.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/// matchMode: EXACT (default) or CONTAINS. The server derives the comparison
/// key from cnValue with LdapNameNormalizer — clients never send keys.
public record CnRuleRequest(
        @NotBlank String roleCode,

        @NotBlank @Size(max = 512)
        String cnValue,

        String matchMode,
        Boolean active,

        @Size(max = 500)
        String description
) {
}
