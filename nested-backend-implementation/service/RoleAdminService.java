package com.bistech.reporting.service;

import com.bistech.reporting.dto.PageResponse;
import com.bistech.reporting.dto.auth.AuditEntryResponse;
import com.bistech.reporting.dto.auth.CnRuleRequest;
import com.bistech.reporting.dto.auth.CnRuleResponse;
import com.bistech.reporting.dto.auth.ManualRevokeResponse;
import com.bistech.reporting.dto.auth.RoleAssignmentResponse;
import com.bistech.reporting.dto.auth.RoleRequest;
import com.bistech.reporting.dto.auth.RoleResponse;
import com.bistech.reporting.dto.auth.UserSummaryResponse;
import com.bistech.reporting.exception.InvalidRoleOperationException;
import com.bistech.reporting.exception.RoleManagementConflictException;
import com.bistech.reporting.model.user.GrantSource;
import com.bistech.reporting.model.user.MatchMode;
import com.bistech.reporting.model.user.Role;
import com.bistech.reporting.model.user.RoleAudit;
import com.bistech.reporting.model.user.RoleCnRule;
import com.bistech.reporting.model.user.RoleCodes;
import com.bistech.reporting.model.user.User;
import com.bistech.reporting.model.user.UserRole;
import com.bistech.reporting.repository.user.RoleAuditRepository;
import com.bistech.reporting.repository.user.RoleCnRuleRepository;
import com.bistech.reporting.repository.user.RoleRepository;
import com.bistech.reporting.repository.user.UserRepository;
import com.bistech.reporting.repository.user.UserRoleRepository;
import com.bistech.reporting.security.LdapNameNormalizer;
import com.bistech.reporting.security.PageCodes;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/// Everything the admin page does: manual grants/revokes, role lifecycle,
/// CN rules, audit reads. Only MANUAL role rows are ever touched here.
/// The actor always comes from the security context (the controller), never
/// from a request body.
@Service
@RequiredArgsConstructor
public class RoleAdminService {

    private static final Logger LOGGER = LoggerFactory.getLogger(RoleAdminService.class);

    private static final int DETAIL_MAX_LENGTH = 500;

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;
    private final RoleCnRuleRepository ruleRepository;
    private final RoleAuditRepository auditRepository;

    // ------------------------------------------------------------ users

    @Transactional(readOnly = true)
    public PageResponse<UserSummaryResponse> listUsers(final String search, final int page, final int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("username").ascending());

        Page<User> users = (search == null || search.isBlank())
                ? userRepository.findAll(pageable)
                : userRepository.search(search.trim(), pageable);

        List<UUID> userIds = users.getContent().stream().map(User::getId).toList();

        Map<UUID, List<UserRole>> assignmentsByUser = userIds.isEmpty()
                ? Map.of()
                : userRoleRepository.findWithRolesByUserIdIn(userIds).stream()
                        .collect(Collectors.groupingBy(assignment -> assignment.getUser().getId()));

        return PageResponse.of(users.map(
                user -> toSummary(user, assignmentsByUser.getOrDefault(user.getId(), List.of()))));
    }

    // ------------------------------------------------------------ manual grant / revoke

    @Transactional
    public RoleAssignmentResponse grantManualRole(final UUID userId, final String roleCode, final String actor) {
        User user = requireUser(userId);
        Role role = requireRole(roleCode);

        if (!role.isActive()) {
            throw new InvalidRoleOperationException("Inactive role cannot be granted: " + role.getCode());
        }

        if (!role.isManualAssignable()) {
            throw new InvalidRoleOperationException("Role is not manually assignable: " + role.getCode());
        }

        Optional<UserRole> existing =
                userRoleRepository.findByUserIdAndRoleIdAndSource(user.getId(), role.getId(), GrantSource.MANUAL);

        if (existing.isPresent()) {
            return RoleAssignmentResponse.from(existing.get());
        }

        UserRole assignment = userRoleRepository.save(UserRole.manual(user, role, actor));

        audit(RoleAudit.ACTION_GRANT, actor, user.getUsername(), role.getCode(), null);

        return RoleAssignmentResponse.from(assignment);
    }

    @Transactional
    public ManualRevokeResponse revokeManualRole(final UUID userId, final String roleCode, final String actor) {
        User user = requireUser(userId);
        Role role = requireRole(roleCode);

        Optional<UserRole> manual =
                userRoleRepository.findByUserIdAndRoleIdAndSource(user.getId(), role.getId(), GrantSource.MANUAL);

        boolean stillSyncAssigned = userRoleRepository
                .findByUserIdAndRoleIdAndSource(user.getId(), role.getId(), GrantSource.SYNC)
                .isPresent();

        if (manual.isEmpty()) {
            return new ManualRevokeResponse(role.getCode(), false, stillSyncAssigned);
        }

        if (RoleCodes.ADMIN.equals(role.getCode())) {
            guardAgainstAdminLockout(user, role, actor);
        }

        userRoleRepository.delete(manual.get());

        audit(RoleAudit.ACTION_REVOKE, actor, user.getUsername(), role.getCode(), null);

        return new ManualRevokeResponse(role.getCode(), true, stillSyncAssigned);
    }

    /// Both failure modes end with the admin page reachable by nobody, which
    /// means fixing production by hand — hence 409, refused outright.
    private void guardAgainstAdminLockout(final User target, final Role adminRole, final String actor) {
        if (target.getUsername().equalsIgnoreCase(actor)) {
            throw new RoleManagementConflictException("You cannot revoke your own ADMIN role");
        }

        long adminHolders = userRoleRepository.countByRoleIdAndSource(adminRole.getId(), GrantSource.MANUAL);

        if (adminHolders <= 1) {
            throw new RoleManagementConflictException("Cannot revoke the last ADMIN");
        }
    }

    // ------------------------------------------------------------ role lifecycle

    @Transactional(readOnly = true)
    public List<RoleResponse> listRoles() {
        return roleRepository.findAll(Sort.by("code")).stream()
                .map(role -> RoleResponse.from(role, userRoleRepository.countByRoleId(role.getId())))
                .toList();
    }

    @Transactional
    public RoleResponse createRole(final RoleRequest request, final String actor) {
        if (request.code() == null || request.code().isBlank()) {
            throw new InvalidRoleOperationException("Role code is required");
        }

        String code = request.code().trim();

        if (roleRepository.existsByCode(code)) {
            throw new RoleManagementConflictException("Role already exists: " + code);
        }

        Role role = Role.builder()
                .code(code)
                .displayName(request.displayName().trim())
                .description(request.description())
                .active(request.active() == null || request.active())
                .syncAssignable(Boolean.TRUE.equals(request.syncAssignable()))
                .manualAssignable(request.manualAssignable() == null || request.manualAssignable())
                .pageCodes(validatedPageCodes(request.pageCodes()))
                .build();

        role = roleRepository.save(role);

        audit(RoleAudit.ACTION_ROLE_CREATE, actor, null, role.getCode(),
                "pages=" + role.getPageCodes() + " syncAssignable=" + role.isSyncAssignable()
                        + " manualAssignable=" + role.isManualAssignable());

        return RoleResponse.from(role, 0);
    }

    /// The role CODE is immutable — it lives in issued tokens, audit rows and
    /// page config. Everything else is editable, within the system-role guards.
    @Transactional
    public RoleResponse updateRole(final String roleCode, final RoleRequest request, final String actor) {
        Role role = requireRole(roleCode);

        if (role.isSystemRole() && Boolean.FALSE.equals(request.active())) {
            throw new RoleManagementConflictException("System role cannot be deactivated: " + role.getCode());
        }

        if (RoleCodes.ADMIN.equals(role.getCode()) && Boolean.TRUE.equals(request.syncAssignable())) {
            throw new RoleManagementConflictException("ADMIN can never be granted by CN rule");
        }

        if (request.displayName() != null && !request.displayName().isBlank()) {
            role.setDisplayName(request.displayName().trim());
        }

        if (request.description() != null) {
            role.setDescription(request.description());
        }

        if (request.active() != null) {
            role.setActive(request.active());
        }

        if (request.syncAssignable() != null) {
            role.setSyncAssignable(request.syncAssignable());
        }

        if (request.manualAssignable() != null) {
            role.setManualAssignable(request.manualAssignable());
        }

        if (request.pageCodes() != null) {
            Set<String> pages = validatedPageCodes(request.pageCodes());
            role.getPageCodes().clear();
            role.getPageCodes().addAll(pages);
        }

        audit(RoleAudit.ACTION_ROLE_UPDATE, actor, null, role.getCode(),
                "active=" + role.isActive() + " pages=" + role.getPageCodes()
                        + " syncAssignable=" + role.isSyncAssignable()
                        + " manualAssignable=" + role.isManualAssignable());

        return RoleResponse.from(role, userRoleRepository.countByRoleId(role.getId()));
    }

    /// Delete is for cleaning up mistakes, never for turning access off:
    /// refused (409) while ANY user holds the role — the FK RESTRICT in the
    /// database enforces the same rule against races. Deactivation is the
    /// everyday off-switch.
    @Transactional
    public void deleteRole(final String roleCode, final String actor) {
        Role role = requireRole(roleCode);

        if (role.isSystemRole()) {
            throw new RoleManagementConflictException("System role cannot be deleted: " + role.getCode());
        }

        long holders = userRoleRepository.countByRoleId(role.getId());

        if (holders > 0) {
            throw new RoleManagementConflictException(
                    "Role " + role.getCode() + " is held by " + holders
                            + " user(s). Deactivate it instead, or revoke the holders first.");
        }

        // CN rules and page rows die with the role (DB ON DELETE CASCADE);
        // audit history survives because it stores codes as plain text.
        ruleRepository.deleteAll(ruleRepository.findByRoleId(role.getId()));
        roleRepository.delete(role);

        audit(RoleAudit.ACTION_ROLE_DELETE, actor, null, role.getCode(), null);
    }

    // ------------------------------------------------------------ CN rules

    @Transactional(readOnly = true)
    public List<CnRuleResponse> listRules() {
        return ruleRepository.findAllWithRole().stream().map(CnRuleResponse::from).toList();
    }

    @Transactional
    public CnRuleResponse createRule(final CnRuleRequest request, final String actor) {
        Role role = requireRole(request.roleCode());
        validateRuleTarget(role);

        RoleCnRule rule = RoleCnRule.builder()
                .role(role)
                .cnValue(request.cnValue().trim())
                .cnKey(normalizedKeyOf(request.cnValue()))
                .matchMode(parseMatchMode(request.matchMode()))
                .active(request.active() == null || request.active())
                .description(request.description())
                .updatedBy(actor)
                .updatedAt(Instant.now())
                .build();

        rule = ruleRepository.save(rule);

        audit(RoleAudit.ACTION_RULE_CREATE, actor, null, role.getCode(),
                "cn='" + rule.getCnValue() + "' mode=" + rule.getMatchMode() + " active=" + rule.isActive());

        return CnRuleResponse.from(rule);
    }

    @Transactional
    public CnRuleResponse updateRule(final Long ruleId, final CnRuleRequest request, final String actor) {
        RoleCnRule rule = ruleRepository.findById(ruleId)
                .orElseThrow(() -> new EntityNotFoundException("CN rule not found: " + ruleId));

        Role role = requireRole(request.roleCode());
        validateRuleTarget(role);

        rule.setRole(role);
        rule.setCnValue(request.cnValue().trim());
        rule.setCnKey(normalizedKeyOf(request.cnValue()));
        rule.setMatchMode(parseMatchMode(request.matchMode()));

        if (request.active() != null) {
            rule.setActive(request.active());
        }

        rule.setDescription(request.description());
        rule.setUpdatedBy(actor);
        rule.setUpdatedAt(Instant.now());

        audit(RoleAudit.ACTION_RULE_UPDATE, actor, null, role.getCode(),
                "cn='" + rule.getCnValue() + "' mode=" + rule.getMatchMode() + " active=" + rule.isActive());

        return CnRuleResponse.from(rule);
    }

    @Transactional
    public void deleteRule(final Long ruleId, final String actor) {
        RoleCnRule rule = ruleRepository.findById(ruleId)
                .orElseThrow(() -> new EntityNotFoundException("CN rule not found: " + ruleId));

        String roleCode = rule.getRole().getCode();

        ruleRepository.delete(rule);

        audit(RoleAudit.ACTION_RULE_DELETE, actor, null, roleCode, "cn='" + rule.getCnValue() + "'");
    }

    /// Write-time half of the escalation boundary: together with
    /// "ADMIN is never sync_assignable", it means no CN rule anyone can
    /// create will ever grant administrator access.
    private void validateRuleTarget(final Role role) {
        if (!role.isSyncAssignable()) {
            throw new InvalidRoleOperationException(
                    "Role is not sync-assignable, CN rules cannot target it: " + role.getCode());
        }

        if (!role.isActive()) {
            throw new InvalidRoleOperationException(
                    "Role is inactive, activate it before pointing CN rules at it: " + role.getCode());
        }
    }

    // ------------------------------------------------------------ pages & audit

    public Map<String, String> listPages() {
        return PageCodes.labels();
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditEntryResponse> listAudit(final int page, final int size) {
        return PageResponse.of(
                auditRepository.findAllByOrderByIdDesc(PageRequest.of(page, size))
                        .map(AuditEntryResponse::from)
        );
    }

    // ------------------------------------------------------------ helpers

    private UserSummaryResponse toSummary(final User user, final List<UserRole> assignments) {
        List<RoleAssignmentResponse> roles = assignments.stream()
                .map(RoleAssignmentResponse::from)
                .sorted(Comparator.comparing(RoleAssignmentResponse::roleCode)
                        .thenComparing(RoleAssignmentResponse::source))
                .toList();

        return new UserSummaryResponse(
                user.getId(),
                user.getUsername(),
                user.getFullName(),
                user.getOrganization(),
                user.getEmail(),
                user.getLastLoggedIn(),
                roles
        );
    }

    private User requireUser(final UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));
    }

    private Role requireRole(final String roleCode) {
        if (roleCode == null || roleCode.isBlank()) {
            throw new InvalidRoleOperationException("Role code must not be blank");
        }

        String normalized = roleCode.trim().toUpperCase(Locale.ROOT);

        return roleRepository.findByCode(normalized)
                .orElseThrow(() -> new EntityNotFoundException("Role not found: " + normalized));
    }

    private Set<String> validatedPageCodes(final Set<String> pageCodes) {
        if (pageCodes == null) {
            return new HashSet<>();
        }

        for (String code : pageCodes) {
            if (!PageCodes.isKnown(code)) {
                throw new InvalidRoleOperationException("Unknown page code: " + code);
            }
        }

        return new HashSet<>(pageCodes);
    }

    private String normalizedKeyOf(final String cnValue) {
        String key = LdapNameNormalizer.normalizeKey(cnValue);

        if (key == null || key.isBlank()) {
            throw new InvalidRoleOperationException("CN value normalizes to an empty key");
        }

        return key;
    }

    private MatchMode parseMatchMode(final String matchMode) {
        if (matchMode == null || matchMode.isBlank()) {
            return MatchMode.EXACT;
        }

        try {
            return MatchMode.valueOf(matchMode.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new InvalidRoleOperationException("Unknown match mode: " + matchMode);
        }
    }

    private void audit(
            final String action,
            final String actor,
            final String username,
            final String roleCode,
            final String detail
    ) {
        String truncated = detail != null && detail.length() > DETAIL_MAX_LENGTH
                ? detail.substring(0, DETAIL_MAX_LENGTH)
                : detail;

        auditRepository.save(RoleAudit.builder()
                .action(action)
                .actor(actor)
                .username(username)
                .roleCode(roleCode)
                .detail(truncated)
                .build());

        LOGGER.info("Audit: {} by '{}' user='{}' role='{}' {}", action, actor, username, roleCode,
                truncated == null ? "" : truncated);
    }
}
