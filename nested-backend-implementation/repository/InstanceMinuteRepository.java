package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.InstanceMinute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

@Repository
public interface InstanceMinuteRepository
        extends JpaRepository<InstanceMinute, Long>,
        JpaSpecificationExecutor<InstanceMinute> {
}
