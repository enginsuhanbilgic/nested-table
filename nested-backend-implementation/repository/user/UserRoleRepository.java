package com.bistech.reporting.repository.user;

import com.bistech.reporting.model.user.GrantSource;
import com.bistech.reporting.model.user.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRoleRepository extends JpaRepository<UserRole, Long> {

    @Query("select ur from UserRole ur join fetch ur.role where ur.user.id = :userId")
    List<UserRole> findWithRolesByUserId(@Param("userId") UUID userId);

    @Query("""
            select ur from UserRole ur join fetch ur.role join fetch ur.user
            where ur.user.id in :userIds
            """)
    List<UserRole> findWithRolesByUserIdIn(@Param("userIds") Collection<UUID> userIds);

    @Query("select ur from UserRole ur join fetch ur.role where ur.user.id = :userId and ur.source = :source")
    List<UserRole> findByUserIdAndSource(@Param("userId") UUID userId, @Param("source") GrantSource source);

    Optional<UserRole> findByUserIdAndRoleIdAndSource(UUID userId, Long roleId, GrantSource source);

    @Modifying
    @Query("delete from UserRole ur where ur.user.id = :userId and ur.role.id in :roleIds and ur.source = :source")
    int deleteByUserIdAndRoleIdInAndSource(
            @Param("userId") UUID userId,
            @Param("roleIds") Collection<Long> roleIds,
            @Param("source") GrantSource source
    );

    long countByRoleId(Long roleId);

    /// Distinct users equals rows here — (user, role, source) is unique.
    long countByRoleIdAndSource(Long roleId, GrantSource source);

    boolean existsByRoleIdAndSource(Long roleId, GrantSource source);
}
