package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.DataFreshness;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface DataFreshnessRepository extends JpaRepository<DataFreshness, Long> {

    // The view holds at most one row; Top... keeps the contract explicit.
    Optional<DataFreshness> findTopByOrderByUpdatedAtDesc();
}
