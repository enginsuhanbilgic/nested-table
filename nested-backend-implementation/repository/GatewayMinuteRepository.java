package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.GatewayMinute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

@Repository
public interface GatewayMinuteRepository
        extends JpaRepository<GatewayMinute, Long>,
        JpaSpecificationExecutor<GatewayMinute> {
}
