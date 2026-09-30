package com.bistech.reporting.model.latency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Exchange-wide baseline latencies for one trading day. Maps
 * stat.v_baseline_stat: per day, the MEDIAN of the per-user daily values
 * (me_p50 / me_p99 / gw_p50 / gw_p99 over grp_type = 'user' rows) -- a
 * "typical user's typical latency", robust to outliers. The view supplies a
 * synthetic row_number() id.
 */
@Immutable
@Entity
@Table(name = "v_baseline_stat", schema = "stat")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class Baseline {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "date")
    private LocalDate date;

    @Column(name = "me_med")
    private BigDecimal meMed;

    @Column(name = "me_p99")
    private BigDecimal meP99;

    @Column(name = "gw_med")
    private BigDecimal gwMed;

    @Column(name = "gw_p99")
    private BigDecimal gwP99;
}
