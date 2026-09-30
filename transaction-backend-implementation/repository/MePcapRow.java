package com.bistech.reporting.repository.transaction;

import java.time.LocalDate;

/**
 * One raw me_pcap row as read by {@link MePcapQueryRepository}.
 * me_net_* / me_vrd_* times are NANOSECONDS since epoch, gw_net_* times are
 * MICROSECONDS since epoch, latency columns are microseconds.
 * client_id_hex and the unused me_asic_* columns are intentionally not
 * carried.
 */
public record MePcapRow(
        Long commitId,
        Long orderId,
        LocalDate txDate,
        String clientId,
        String appId,
        Long appSeq,
        Integer status,
        String node,
        Short partition,
        String process,
        Short side,
        String series,
        String userName,
        String participant,
        String market,
        String accountId,
        String inputMessageType,
        Integer connectorPort,
        Long meVrdInputTime,
        Long meVrdOutputTime,
        Long meNetInputTime,
        Long meNetOutputTime,
        Long gwNetInputTime,
        Long gwNetOutputTime,
        Long meVrdLatency,
        Long meNetLatency,
        Long gwNetLatency
) {
}
