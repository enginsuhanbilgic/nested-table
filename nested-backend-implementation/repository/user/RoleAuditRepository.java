package com.bistech.reporting.repository.user;

import com.bistech.reporting.model.user.RoleAudit;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleAuditRepository extends JpaRepository<RoleAudit, Long> {

    Page<RoleAudit> findAllByOrderByIdDesc(Pageable pageable);
}
