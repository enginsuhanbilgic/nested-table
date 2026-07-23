package com.bistech.reporting.model.latency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * One user per trading day, with its lineage context (participant, gateway
 * node, node instance) and connector ports. Maps stat.v_user_daily
 * (grp_type = 'user' rows). The view supplies a synthetic row_number() id
 * (query-scoped -- not a stable identifier).
 */
@Immutable
@Entity
@Table(name = "v_user_daily", schema = "stat")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class UserDaily {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "tx_date")
    private LocalDate date;

    @Column(name = "name")
    private String name;

    @Column(name = "participant_name")
    private String participantName;

    @Column(name = "gw_node")
    private String gwNode;

    @Column(name = "node_instance")
    private String nodeInstance;

    // Postgres integer[]; requires Hibernate 6.1+ array mapping.
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "ports")
    private List<Integer> ports;

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
