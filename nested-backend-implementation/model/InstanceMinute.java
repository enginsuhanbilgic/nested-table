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
 * One minute bucket of a gateway instance's latency. Maps
 * stat.v_instance_minute (name = process, gateway_name = node). The view
 * supplies a synthetic row_number() id (query-scoped -- not a stable
 * identifier).
 */
@Immutable
@Entity
@Table(name = "v_instance_minute", schema = "stat")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class InstanceMinute {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "tx_date")
    private LocalDate date;

    @Column(name = "name")
    private String name;

    @Column(name = "gateway_name")
    private String gatewayName;

    @Column(name = "hour")
    private Integer hour;

    @Column(name = "minute")
    private Integer minute;

    @Column(name = "no_ord")
    private Long noOrd;

    @Column(name = "me_med")
    private BigDecimal meMed;

    @Column(name = "me_avg")
    private BigDecimal meAvg;

    @Column(name = "me_max")
    private Long meMax;

    @Column(name = "me_p99")
    private BigDecimal meP99;

    @Column(name = "gw_med")
    private BigDecimal gwMed;

    @Column(name = "gw_avg")
    private BigDecimal gwAvg;

    @Column(name = "gw_max")
    private Long gwMax;

    @Column(name = "gw_p99")
    private BigDecimal gwP99;
}
