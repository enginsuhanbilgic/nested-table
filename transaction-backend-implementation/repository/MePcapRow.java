package com.bistech.reporting.repository.transaction;

import java.time.LocalDate;

/**
 * One raw me_pcap row as read by {@link MePcapQueryRepository}. Time columns
 * are nanoseconds since epoch, latency columns are microseconds.
 * client_id_hex is intentionally not carried.
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
        Long meAsicInputTime,
        Long meAsicOutputTime,
        Long meVrdLatency,
        Long meNetLatency,
        Long gwNetLatency,
        Long meAsicLatency
) {
}
