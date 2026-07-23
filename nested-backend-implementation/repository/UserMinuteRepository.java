package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.UserMinute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

@Repository
public interface UserMinuteRepository
        extends JpaRepository<UserMinute, Long>,
        JpaSpecificationExecutor<UserMinute> {
}
