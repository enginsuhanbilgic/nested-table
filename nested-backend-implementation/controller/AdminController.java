package com.bistech.reporting.controller;

import com.bistech.reporting.dto.PageResponse;
import com.bistech.reporting.dto.auth.AuditEntryResponse;
import com.bistech.reporting.dto.auth.CnRuleRequest;
import com.bistech.reporting.dto.auth.CnRuleResponse;
import com.bistech.reporting.dto.auth.ManualRevokeResponse;
import com.bistech.reporting.dto.auth.RoleAssignmentResponse;
import com.bistech.reporting.dto.auth.RoleRequest;
import com.bistech.reporting.dto.auth.RoleResponse;
import com.bistech.reporting.dto.auth.UserSummaryResponse;
import com.bistech.reporting.security.AuthPrincipal;
import com.bistech.reporting.service.RoleAdminService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/// The admin API behind the single admin page. Guarded twice on purpose:
/// the /api/admin/** URL rule in SecurityConfig AND this class-level
/// @PreAuthorize. The acting username is always taken from the principal —
/// request bodies cannot claim to be someone else.
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminController {

    private final RoleAdminService roleAdminService;

    // ---------------------------------------------------------------- users

    @GetMapping("/users")
    public ResponseEntity<PageResponse<UserSummaryResponse>> listUsers(
            final @RequestParam(required = false) String search,
            final @RequestParam(defaultValue = "0") int page,
            final @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(roleAdminService.listUsers(search, page, size));
    }

    @PutMapping("/users/{userId}/roles/{roleCode}")
    public ResponseEntity<RoleAssignmentResponse> grantRole(
            final @PathVariable UUID userId,
            final @PathVariable String roleCode,
            final @AuthenticationPrincipal AuthPrincipal principal
    ) {
        return ResponseEntity.ok(roleAdminService.grantManualRole(userId, roleCode, principal.username()));
    }

    @DeleteMapping("/users/{userId}/roles/{roleCode}")
    public ResponseEntity<ManualRevokeResponse> revokeRole(
            final @PathVariable UUID userId,
            final @PathVariable String roleCode,
            final @AuthenticationPrincipal AuthPrincipal principal
    ) {
        return ResponseEntity.ok(roleAdminService.revokeManualRole(userId, roleCode, principal.username()));
    }

    // ---------------------------------------------------------------- roles

    @GetMapping("/roles")
    public ResponseEntity<java.util.List<RoleResponse>> listRoles() {
        return ResponseEntity.ok(roleAdminService.listRoles());
    }

    @PostMapping("/roles")
    public ResponseEntity<RoleResponse> createRole(
            final @Valid @RequestBody RoleRequest request,
            final @AuthenticationPrincipal AuthPrincipal principal
    ) {
        return ResponseEntity.ok(roleAdminService.createRole(request, principal.username()));
    }

    @PutMapping("/roles/{roleCode}")
    public ResponseEntity<RoleResponse> updateRole(
            final @PathVariable String roleCode,
            final @Valid @RequestBody RoleRequest request,
            final @AuthenticationPrincipal AuthPrincipal principal
    ) {
        return ResponseEntity.ok(roleAdminService.updateRole(roleCode, request, principal.username()));
    }

    @DeleteMapping("/roles/{roleCode}")
    public ResponseEntity<Void> deleteRole(
            final @PathVariable String roleCode,
            final @AuthenticationPrincipal AuthPrincipal principal
    ) {
        roleAdminService.deleteRole(roleCode, principal.username());
        return ResponseEntity.noContent().build();
    }

    /// Page codes + labels for the role editor's checkboxes.
    @GetMapping("/pages")
    public ResponseEntity<Map<String, String>> listPages() {
        return ResponseEntity.ok(roleAdminService.listPages());
    }

    // ---------------------------------------------------------------- CN rules

    @GetMapping("/cn-rules")
    public ResponseEntity<java.util.List<CnRuleResponse>> listRules() {
        return ResponseEntity.ok(roleAdminService.listRules());
    }

    @PostMapping("/cn-rules")
    public ResponseEntity<CnRuleResponse> createRule(
            final @Valid @RequestBody CnRuleRequest request,
            final @AuthenticationPrincipal AuthPrincipal principal
    ) {
        return ResponseEntity.ok(roleAdminService.createRule(request, principal.username()));
    }

    @PutMapping("/cn-rules/{ruleId}")
    public ResponseEntity<CnRuleResponse> updateRule(
            final @PathVariable Long ruleId,
            final @Valid @RequestBody CnRuleRequest request,
            final @AuthenticationPrincipal AuthPrincipal principal
    ) {
        return ResponseEntity.ok(roleAdminService.updateRule(ruleId, request, principal.username()));
    }

    @DeleteMapping("/cn-rules/{ruleId}")
    public ResponseEntity<Void> deleteRule(
            final @PathVariable Long ruleId,
            final @AuthenticationPrincipal AuthPrincipal principal
    ) {
        roleAdminService.deleteRule(ruleId, principal.username());
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- audit

    @GetMapping("/audit")
    public ResponseEntity<PageResponse<AuditEntryResponse>> listAudit(
            final @RequestParam(defaultValue = "0") int page,
            final @RequestParam(defaultValue = "50") int size
    ) {
        return ResponseEntity.ok(roleAdminService.listAudit(page, size));
    }
}
