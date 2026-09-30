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

/// "If one of the user's LDAP groups has this CN, grant this role."
/// cnValue is the admin's text (display only); cnKey is LdapNameNormalizer
/// output and is the only field ever compared.
@Entity
@Table(name = "lr_role_cn_rules", schema = "stat")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoleCnRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "role_id",
            nullable = false,
            foreignKey = @ForeignKey(name = "fk_lr_role_cn_rules_role")
    )
    private Role role;

    @Column(name = "cn_value", nullable = false, length = 512)
    private String cnValue;

    @Column(name = "cn_key", nullable = false, length = 512)
    private String cnKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "match_mode", nullable = false, length = 10)
    @Builder.Default
    private MatchMode matchMode = MatchMode.EXACT;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "updated_by", nullable = false, length = 255)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
