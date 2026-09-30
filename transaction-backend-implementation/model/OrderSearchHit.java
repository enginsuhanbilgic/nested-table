package com.bistech.reporting.model.transaction;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDate;

/**
 * Snapshot of one me_pcap row matched by an order search. Immutable facts of
 * the order at search time; written once by the worker, read-only afterwards.
 */
@Entity
@Table(name = "order_search_hit", schema = "stat")
@IdClass(OrderSearchHit.Key.class)
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderSearchHit {

    @Id
    @Column(name = "search_id")
    private Long searchId;

    @Id
    @Column(name = "commit_id")
    private Long commitId;

    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "tx_date")
    private LocalDate txDate;

    @Column(name = "client_id")
    private String clientId;

    @Column(name = "app_id")
    private String appId;

    @Column(name = "app_seq")
    private Long appSeq;

    @Column(name = "status")
    private Integer status;

    @Column(name = "node")
    private String node;

    @Column(name = "partition")
    private Short partition;

    @Column(name = "process")
    private String process;

    @Column(name = "side")
    private Short side;

    @Column(name = "series")
    private String series;

    @Column(name = "user_name")
    private String userName;

    @Column(name = "participant")
    private String participant;

    @Column(name = "market")
    private String market;

    @Column(name = "account_id")
    private String accountId;

    @Column(name = "input_message_type")
    private String inputMessageType;

    @Column(name = "connector_port")
    private Integer connectorPort;

    @Column(name = "me_vrd_input_time")
    private Long meVrdInputTime;

    @Column(name = "me_vrd_output_time")
    private Long meVrdOutputTime;

    @Column(name = "me_net_input_time")
    private Long meNetInputTime;

    @Column(name = "me_net_output_time")
    private Long meNetOutputTime;

    @Column(name = "gw_net_input_time")
    private Long gwNetInputTime;

    @Column(name = "gw_net_output_time")
    private Long gwNetOutputTime;

    @Column(name = "me_vrd_latency")
    private Long meVrdLatency;

    @Column(name = "me_net_latency")
    private Long meNetLatency;

    @Column(name = "gw_net_latency")
    private Long gwNetLatency;

    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long searchId;
        private Long commitId;
    }
}
