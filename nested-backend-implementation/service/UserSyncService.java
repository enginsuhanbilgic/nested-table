package com.bistech.reporting.service;

import com.bistech.reporting.dto.auth.LdapAuthResponse;
import com.bistech.reporting.model.user.GrantSource;
import com.bistech.reporting.model.user.MatchMode;
import com.bistech.reporting.model.user.Role;
import com.bistech.reporting.model.user.RoleCnRule;
import com.bistech.reporting.model.user.RoleCodes;
import com.bistech.reporting.model.user.User;
import com.bistech.reporting.model.user.UserRole;
import com.bistech.reporting.repository.user.RoleCnRuleRepository;
import com.bistech.reporting.repository.user.RoleRepository;
import com.bistech.reporting.repository.user.UserRepository;
import com.bistech.reporting.repository.user.UserRoleRepository;
import com.bistech.reporting.security.LdapNameNormalizer;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/// Owns everything the directory decides: the user's profile row and the
/// SYNC-source role rows. Never touches MANUAL rows — that separation is the
/// whole design (plan §3.3).
///
/// A CN-rule problem costs one user one role and a WARN line. It never fails
/// a login: configuration errors are the startup validator's job.
@Service
@RequiredArgsConstructor
public class UserSyncService {

    private static final Logger LOGGER = LoggerFactory.getLogger(UserSyncService.class);

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;
    private final RoleCnRuleRepository ruleRepository;

    /// Login path: upsert the profile from LDAP, then rebuild SYNC roles.
    /// Throws IllegalArgumentException when LDAP omitted a required field —
    /// AuthService maps that to "authentication service" semantics.
    ///
    /// On a concurrent FIRST login the losing transaction dies on the unique
    /// constraint; AuthService retries once (a new transaction finds the row).
    @Transactional
    public User synchronizeOnLogin(final LdapAuthResponse ldapAuthResponse) {
        validateLdapUser(ldapAuthResponse);

        User user = upsertProfile(ldapAuthResponse);
        applySyncRoles(user);

        return user;
    }

    /// Refresh path: re-run the CN rules against the groups stored at last
    /// login, so rule edits reach users within one access-token lifetime.
    /// Caller must hold the user lock (UserRepository.findAndLockById) and a
    /// transaction.
    @Transactional
    public void resynchronize(final User user) {
        applySyncRoles(user);
    }

    private User upsertProfile(final LdapAuthResponse ldap) {
        Optional<User> existing = userRepository.findByEmployeeId(ldap.employeeId().trim());
        User user = existing.orElseGet(User::new);

        if (existing.isEmpty()) {
            LOGGER.info("User '{}' not found in database. Creating.", ldap.username());
        }

        user.setEmployeeId(ldap.employeeId().trim());
        user.setUsername(ldap.username().trim());
        user.setFullName(ldap.fullName().trim());
        user.setEmail(ldap.email());
        user.setOrganization(ldap.organization());
        user.setLastLoggedIn(Instant.now());

        Set<String> groups = normalizedMemberOf(ldap.memberOf());
        if (!user.getMemberOf().equals(groups)) {
            user.getMemberOf().clear();
            user.getMemberOf().addAll(groups);
        }

        return userRepository.save(user);
    }

    private void applySyncRoles(final User user) {
        Set<String> cnKeys = user.getMemberOf().stream()
                .map(LdapNameNormalizer::extractCn)
                .filter(Objects::nonNull)
                .map(LdapNameNormalizer::normalizeKey)
                .filter(key -> !key.isBlank())
                .collect(Collectors.toSet());

        Map<Long, Role> desired = new HashMap<>();

        roleRepository.findByCode(RoleCodes.STANDARD_USER).ifPresentOrElse(
                standard -> {
                    if (standard.isActive()) {
                        desired.put(standard.getId(), standard);
                    }
                },
                () -> LOGGER.error("Role {} is missing — the startup validator should have refused to boot",
                        RoleCodes.STANDARD_USER)
        );

        for (RoleCnRule rule : ruleRepository.findAllActiveWithRole()) {
            boolean exact = rule.getMatchMode() == MatchMode.EXACT;

            if (!LdapNameNormalizer.matches(rule.getCnKey(), exact, cnKeys)) {
                continue;
            }

            Role role = rule.getRole();

            if (!role.isActive()) {
                LOGGER.warn("CN rule {} matched user '{}' but role '{}' is inactive — skipped",
                        rule.getId(), user.getUsername(), role.getCode());
                continue;
            }

            if (!role.isSyncAssignable()) {
                LOGGER.warn("CN rule {} matched user '{}' but role '{}' is not sync-assignable — skipped",
                        rule.getId(), user.getUsername(), role.getCode());
                continue;
            }

            desired.put(role.getId(), role);
        }

        List<UserRole> current = userRoleRepository.findByUserIdAndSource(user.getId(), GrantSource.SYNC);
        Set<Long> currentRoleIds = current.stream()
                .map(assignment -> assignment.getRole().getId())
                .collect(Collectors.toSet());

        List<Long> removedRoleIds = currentRoleIds.stream()
                .filter(roleId -> !desired.containsKey(roleId))
                .toList();

        if (!removedRoleIds.isEmpty()) {
            userRoleRepository.deleteByUserIdAndRoleIdInAndSource(user.getId(), removedRoleIds, GrantSource.SYNC);
        }

        List<UserRole> added = new ArrayList<>();
        for (Map.Entry<Long, Role> entry : desired.entrySet()) {
            if (!currentRoleIds.contains(entry.getKey())) {
                added.add(UserRole.sync(user, entry.getValue()));
            }
        }

        if (!added.isEmpty()) {
            userRoleRepository.saveAll(added);
        }

        if (!removedRoleIds.isEmpty() || !added.isEmpty()) {
            LOGGER.info("Synchronized roles for '{}': +{} -{}",
                    user.getUsername(),
                    added.stream().map(a -> a.getRole().getCode()).toList(),
                    removedRoleIds.size());
        }
    }

    private Set<String> normalizedMemberOf(final List<String> memberOf) {
        if (memberOf == null) {
            return new HashSet<>();
        }

        return memberOf.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .collect(Collectors.toSet());
    }

    private void validateLdapUser(final LdapAuthResponse ldapAuthResponse) {
        if (ldapAuthResponse == null) {
            throw new IllegalArgumentException("LDAP response cannot be empty");
        }

        validateRequiredLdapField("username", ldapAuthResponse.username());
        validateRequiredLdapField("employeeId", ldapAuthResponse.employeeId());
        validateRequiredLdapField("fullName", ldapAuthResponse.fullName());
    }

    private void validateRequiredLdapField(final String fieldName, final String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("LDAP response is missing required field: " + fieldName);
        }
    }
}
