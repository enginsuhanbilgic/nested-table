package com.bistech.reporting.dto.auth;

import com.bistech.reporting.model.user.RoleCnRule;

import java.time.Instant;

/// cnKey is shown in the UI on purpose: a rule that never matches produces no
/// error anywhere, so the normalized key is the admin's only feedback.
public record CnRuleResponse(
        Long id,
        String roleCode,
        String roleDisplayName,
        String cnValue,
        String cnKey,
        String matchMode,
        boolean active,
        String description,
        String updatedBy,
        Instant updatedAt
) {
    public static CnRuleResponse from(final RoleCnRule rule) {
        return new CnRuleResponse(
                rule.getId(),
                rule.getRole().getCode(),
                rule.getRole().getDisplayName(),
                rule.getCnValue(),
                rule.getCnKey(),
                rule.getMatchMode().name(),
                rule.isActive(),
                rule.getDescription(),
                rule.getUpdatedBy(),
                rule.getUpdatedAt()
        );
    }
}
