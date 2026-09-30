package com.bistech.reporting.repository;

import com.bistech.reporting.model.audit.UserPageHistory;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;
import java.util.UUID;

public interface UserPageHistoryRepository extends JpaRepository<UserPageHistory, Long>, JpaSpecificationExecutor<UserPageHistory> {

    @EntityGraph(attributePaths = "user")
    List<UserPageHistory> findByUserIdOrderByVisitTimestampDesc(UUID userId);

    @Override
    @EntityGraph(attributePaths = "user")
    Page<UserPageHistory> findAll(Specification<UserPageHistory> spec, Pageable pageable);
}
