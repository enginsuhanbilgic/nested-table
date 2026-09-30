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

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/// Plain profile entity. Role assignments live in {@link UserRole} rows and are
/// managed through UserRoleRepository — the entity holds no role collection on
/// purpose (that is where the old design's bugs lived).
@Entity
@Table(name = "lr_users", schema = "stat")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "username", nullable = false, length = 255)
    private String username;

    @Column(name = "employee_id", nullable = false, length = 255)
    private String employeeId;

    @Column(name = "full_name", nullable = false, length = 255)
    private String fullName;

    @Column(name = "organization", length = 255)
    private String organization;

    @Column(name = "email", length = 63)
    private String email;

    @Column(name = "last_logged_in")
    private Instant lastLoggedIn;

    /// LDAP groups seen at the last login; read by refresh-time rule
    /// re-evaluation. A Set so unchanged logins do not rewrite the table.
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(
            name = "user_member_of",
            schema = "stat",
            joinColumns = @JoinColumn(
                    name = "user_id",
                    nullable = false,
                    foreignKey = @ForeignKey(name = "fk_user_member_of_user")
            )
    )
    @Column(name = "member_of", nullable = false, length = 512)
    @Builder.Default
    private Set<String> memberOf = new HashSet<>();
}
