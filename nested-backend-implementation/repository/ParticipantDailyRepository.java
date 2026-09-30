package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.ParticipantDaily;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Repository;

@Repository
public interface ParticipantDailyRepository
        extends JpaRepository<ParticipantDaily, Long>,
        JpaSpecificationExecutor<ParticipantDaily> {

    @Override
    Page<ParticipantDaily> findAll(
            @Nullable Specification<ParticipantDaily> spec,
            Pageable pageable
    );
}
