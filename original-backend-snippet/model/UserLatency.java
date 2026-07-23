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

@Immutable
@Entity
@Table(name = "view_user_latency", schema = "stat")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class UserLatency {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "tx_date")
    private LocalDate date;

    @Column(name = "node")
    private String node;

    @Column(name = "participant_name")
    private String participantName;

    @Column(name = "no_participant")
    private String noParticipant;

    @Column(name = "user_name")
    private String username;

    @Column(name = "partition")
    private Short partition;

    @Column(name = "process")
    private String process;

    @Column(name = "location")
    private String location;

    @Column(name = "protocol")
    private String protocol;

    @Column(name = "no_user")
    private Integer noUser;

    @Column(name = "no_ord_in_volatile")
    private Integer noOrdInVolatile;

    @Column(name = "no_ord")
    private Integer noOrd;

    @Column(name = "ratio")
    private BigDecimal ratio;

    @Column(name = "gw_med")
    private Integer gwMed;

    @Column(name = "gw_avg")
    private Integer gwAvg;

    @Column(name = "gw_min")
    private Integer gwMin;

    @Column(name = "gw_max")
    private Integer gwMax;

    @Column(name = "me_med")
    private Integer meMed;

    @Column(name = "me_avg")
    private Integer meAvg;

    @Column(name = "me_min")
    private Integer meMin;

    @Column(name = "me_max")
    private Integer meMax;
}
