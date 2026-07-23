package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.ParticipantMinute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

@Repository
public interface ParticipantMinuteRepository
        extends JpaRepository<ParticipantMinute, Long>,
        JpaSpecificationExecutor<ParticipantMinute> {
}
