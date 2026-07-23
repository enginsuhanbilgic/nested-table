package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.UserDaily;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Repository;

@Repository
public interface UserDailyRepository
        extends JpaRepository<UserDaily, Long>,
        JpaSpecificationExecutor<UserDaily> {

    @Override
    Page<UserDaily> findAll(
            @Nullable Specification<UserDaily> spec,
            Pageable pageable
    );
}
