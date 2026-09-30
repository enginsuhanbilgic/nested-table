package com.bistech.reporting.model.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/// Append-only history of manual grants/revokes and role/rule changes.
/// Deliberately denormalized (plain text, no FKs) so history survives deletion
/// of whatever it describes. Never updated, never deleted.
@Entity
@Table(name = "lr_role_audit", schema = "stat")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoleAudit {

    public static final String ACTION_GRANT = "GRANT";
    public static final String ACTION_REVOKE = "REVOKE";
    public static final String ACTION_ROLE_CREATE = "ROLE_CREATE";
    public static final String ACTION_ROLE_UPDATE = "ROLE_UPDATE";
    public static final String ACTION_ROLE_DELETE = "ROLE_DELETE";
    public static final String ACTION_RULE_CREATE = "RULE_CREATE";
    public static final String ACTION_RULE_UPDATE = "RULE_UPDATE";
    public static final String ACTION_RULE_DELETE = "RULE_DELETE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @Column(name = "happened_at", nullable = false)
    @Builder.Default
    private Instant happenedAt = Instant.now();

    @Column(name = "action", nullable = false, length = 20)
    private String action;

    /// Who performed the change (from the security context, never the request).
    @Column(name = "actor", nullable = false, length = 255)
    private String actor;

    /// Affected user, when the action targets one.
    @Column(name = "username", length = 255)
    private String username;

    @Column(name = "role_code", length = 100)
    private String roleCode;

    @Column(name = "detail", length = 500)
    private String detail;
}
