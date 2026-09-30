package com.bistech.reporting.model.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/// One grant of one role to one user from one source. Insert-only: sync
/// deletes and inserts SYNC rows, admins insert and delete MANUAL rows.
/// Surrogate id — no embedded key, no equals/hashCode traps.
@Entity
@Table(name = "lr_user_roles", schema = "stat")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserRole {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "user_id",
            nullable = false,
            foreignKey = @ForeignKey(name = "fk_lr_user_roles_user")
    )
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "role_id",
            nullable = false,
            foreignKey = @ForeignKey(name = "fk_lr_user_roles_role")
    )
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 10)
    private GrantSource source;

    @Column(name = "granted_at", nullable = false)
    @Builder.Default
    private Instant grantedAt = Instant.now();

    /// Admin username for MANUAL rows; null for SYNC rows.
    @Column(name = "granted_by", length = 255)
    private String grantedBy;

    public static UserRole sync(final User user, final Role role) {
        return UserRole.builder()
                .user(user)
                .role(role)
                .source(GrantSource.SYNC)
                .build();
    }

    public static UserRole manual(final User user, final Role role, final String grantedBy) {
        return UserRole.builder()
                .user(user)
                .role(role)
                .source(GrantSource.MANUAL)
                .grantedBy(grantedBy)
                .build();
    }
}
