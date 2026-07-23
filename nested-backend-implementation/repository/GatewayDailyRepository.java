package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.GatewayDaily;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Repository;

@Repository
public interface GatewayDailyRepository
        extends JpaRepository<GatewayDaily, Long>,
        JpaSpecificationExecutor<GatewayDaily> {

    @Override
    Page<GatewayDaily> findAll(
            @Nullable Specification<GatewayDaily> spec,
            Pageable pageable
    );
}
