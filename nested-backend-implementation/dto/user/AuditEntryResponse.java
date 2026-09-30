package com.bistech.reporting.dto.auth;

import com.bistech.reporting.model.user.RoleAudit;

import java.time.Instant;

public record AuditEntryResponse(
        Long id,
        Instant happenedAt,
        String action,
        String actor,
        String username,
        String roleCode,
        String detail
) {
    public static AuditEntryResponse from(final RoleAudit audit) {
        return new AuditEntryResponse(
                audit.getId(),
                audit.getHappenedAt(),
                audit.getAction(),
                audit.getActor(),
                audit.getUsername(),
                audit.getRoleCode(),
                audit.getDetail()
        );
    }
}
