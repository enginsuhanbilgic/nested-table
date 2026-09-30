package com.bistech.reporting.repository.user;

import com.bistech.reporting.model.user.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmployeeId(String employeeId);

    Optional<User> findByUsername(String username);

    /// Serializes concurrent role re-synchronization for one user (e.g. two
    /// browser tabs refreshing at once).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findAndLockById(@Param("id") UUID id);

    @Query("""
            select u from User u
            where lower(u.username) like lower(concat('%', :query, '%'))
               or lower(u.fullName) like lower(concat('%', :query, '%'))
               or lower(u.employeeId) like lower(concat('%', :query, '%'))
            """)
    Page<User> search(@Param("query") String query, Pageable pageable);
}
