package com.bistech.reporting.dto.auth;

import com.bistech.reporting.model.user.UserRole;

import java.time.Instant;

public record RoleAssignmentResponse(
        String roleCode,
        String roleDisplayName,
        String source,
        String grantedBy,
        Instant grantedAt
) {
    public static RoleAssignmentResponse from(final UserRole assignment) {
        return new RoleAssignmentResponse(
                assignment.getRole().getCode(),
                assignment.getRole().getDisplayName(),
                assignment.getSource().name(),
                assignment.getGrantedBy(),
                assignment.getGrantedAt()
        );
    }
}
