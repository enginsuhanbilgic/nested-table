package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.InstanceDaily;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Repository;

@Repository
public interface InstanceDailyRepository
        extends JpaRepository<InstanceDaily, Long>,
        JpaSpecificationExecutor<InstanceDaily> {

    @Override
    Page<InstanceDaily> findAll(
            @Nullable Specification<InstanceDaily> spec,
            Pageable pageable
    );
}
