package com.bistech.reporting.dto.auth;

import com.bistech.reporting.model.user.Role;

import java.util.Set;
import java.util.TreeSet;

/// system=true → the UI locks deactivate/delete (ADMIN, STANDARD_USER).
public record RoleResponse(
        Long id,
        String code,
        String displayName,
        String description,
        boolean active,
        boolean syncAssignable,
        boolean manualAssignable,
        boolean system,
        Set<String> pageCodes,
        long holderCount
) {
    public static RoleResponse from(final Role role, final long holderCount) {
        return new RoleResponse(
                role.getId(),
                role.getCode(),
                role.getDisplayName(),
                role.getDescription(),
                role.isActive(),
                role.isSyncAssignable(),
                role.isManualAssignable(),
                role.isSystemRole(),
                new TreeSet<>(role.getPageCodes()),
                holderCount
        );
    }
}
