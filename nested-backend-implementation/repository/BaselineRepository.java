package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.Baseline;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface BaselineRepository extends JpaRepository<Baseline, Long> {

    Optional<Baseline> findByDate(LocalDate date);
}
