package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.SeriesDaily;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface SeriesDailyRepository
        extends JpaRepository<SeriesDaily, Long>,
        JpaSpecificationExecutor<SeriesDaily> {

    @Override
    Page<SeriesDaily> findAll(
            @Nullable Specification<SeriesDaily> spec,
            Pageable pageable
    );

    /**
     * Daily history of one series for the /nested/series-history chart.
     */
    List<SeriesDaily> findByNameAndDateGreaterThanEqualOrderByDateAsc(
            String name,
            LocalDate date
    );
}
