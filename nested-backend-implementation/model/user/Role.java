package com.bistech.reporting.model.user;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "lr_roles", schema = "stat")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Role {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    @Column(name = "code", nullable = false, length = 100, updatable = false)
    private String code;

    @Column(name = "display_name", nullable = false, length = 255)
    private String displayName;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "sync_assignable", nullable = false)
    private boolean syncAssignable;

    @Column(name = "manual_assignable", nullable = false)
    private boolean manualAssignable;

    /// Pages this role may see. Codes are constants in PageCodes; the mapping
    /// is runtime data. EAGER: at most a handful of codes per role, and every
    /// token build needs them.
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "lr_role_pages",
            schema = "stat",
            joinColumns = @JoinColumn(
                    name = "role_id",
                    nullable = false,
                    foreignKey = @ForeignKey(name = "fk_lr_role_pages_role")
            )
    )
    @Column(name = "page_code", nullable = false, length = 50)
    @Builder.Default
    private Set<String> pageCodes = new HashSet<>();

    public boolean isSystemRole() {
        return RoleCodes.SYSTEM_ROLES.contains(code);
    }
}
