package com.bistech.reporting.config;

import com.bistech.reporting.model.user.GrantSource;
import com.bistech.reporting.model.user.Role;
import com.bistech.reporting.model.user.RoleCodes;
import com.bistech.reporting.repository.user.RoleRepository;
import com.bistech.reporting.repository.user.UserRoleRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.Optional;

/// Configuration errors fail AT STARTUP, while someone is watching the
/// deploy — never as a mysterious login outage blamed on LDAP (the old
/// behavior: one missing role row rejected every login in the system).
@Component
@RequiredArgsConstructor
public class RbacStartupValidator implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(RbacStartupValidator.class);

    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;

    @Override
    public void run(final ApplicationArguments args) {
        for (String code : RoleCodes.REQUIRED) {
            Optional<Role> role = roleRepository.findByCode(code);

            if (role.isEmpty()) {
                throw new IllegalStateException(
                        "Required role '" + code + "' is missing from stat.lr_roles. "
                                + "Run sql/V1__role_rehaul.sql before starting this build.");
            }

            if (!role.get().isActive()) {
                throw new IllegalStateException("Required role '" + code + "' is inactive.");
            }
        }

        roleRepository.findByCode(RoleCodes.ADMIN).ifPresent(admin -> {
            if (admin.isSyncAssignable()) {
                throw new IllegalStateException(
                        "ADMIN is sync_assignable — a CN rule could grant administrator access. Fix the row.");
            }

            if (!userRoleRepository.existsByRoleIdAndSource(admin.getId(), GrantSource.MANUAL)) {
                // Warn, not fail: this is the expected state right after the
                // rebuild, until the one-time bootstrap insert is run.
                LOGGER.warn("Nobody holds ADMIN. The admin page is unreachable until the bootstrap "
                        + "insert in sql/V1__role_rehaul.sql is run for the first administrator.");
            }
        });

        LOGGER.info("RBAC startup validation passed.");
    }
}
