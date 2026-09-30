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
 * One gateway node per trading day. Maps stat.v_gateway_daily
 * (grp_type = 'node' rows of stat.latency_daily_stat). The view supplies a
 * synthetic row_number() id (query-scoped -- not a stable identifier).
 */
@Immutable
@Entity
@Table(name = "v_gateway_daily", schema = "stat")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class GatewayDaily {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "tx_date")
    private LocalDate date;

    @Column(name = "name")
    private String name;

    @Column(name = "num_instances")
    private Integer numInstances;

    @Column(name = "num_users")
    private Integer numUsers;

    @Column(name = "num_orders")
    private Long numOrders;

    @Column(name = "num_orders_in_peak_times")
    private Long numOrdersInPeakTimes;

    @Column(name = "peak_ratio")
    private BigDecimal peakRatio;

    @Column(name = "me_med")
    private BigDecimal meMed;

    @Column(name = "me_avg")
    private BigDecimal meAvg;

    @Column(name = "me_max")
    private Long meMax;

    @Column(name = "me_min")
    private Long meMin;

    @Column(name = "me_p99")
    private BigDecimal meP99;

    @Column(name = "gw_med")
    private BigDecimal gwMed;

    @Column(name = "gw_avg")
    private BigDecimal gwAvg;

    @Column(name = "gw_max")
    private Long gwMax;

    @Column(name = "gw_min")
    private Long gwMin;

    @Column(name = "gw_p99")
    private BigDecimal gwP99;
}
