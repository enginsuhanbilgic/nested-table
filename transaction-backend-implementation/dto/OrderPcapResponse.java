package com.bistech.reporting.dto.transaction;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import java.time.LocalDate;

/**
 * One me_pcap row for display -- used both for the searched order's hits and
 * for neighbor rows, so the two grids share one column contract. *_time
 * fields are nanoseconds since epoch, *_latency fields are microseconds.
 *
 * Ids and nanosecond timestamps are serialized as JSON STRINGS on purpose:
 * their values exceed JavaScript's Number.MAX_SAFE_INTEGER (2^53), so a
 * numeric JSON encoding would silently corrupt them in the browser. The
 * frontend types them as string and does arithmetic with BigInt. Latencies
 * are microsecond-scale and stay numeric.
 */
public record OrderPcapResponse(
        @JsonProperty("commit_id")
        @JsonSerialize(using = ToStringSerializer.class) Long commitId,
        @JsonProperty("order_id")
        @JsonSerialize(using = ToStringSerializer.class) Long orderId,
        @JsonProperty("tx_date") LocalDate txDate,
        @JsonProperty("client_id") String clientId,
        @JsonProperty("app_id") String appId,
        @JsonProperty("app_seq") Long appSeq,
        @JsonProperty("status") Integer status,
        @JsonProperty("node") String node,
        @JsonProperty("partition") Short partition,
        @JsonProperty("process") String process,
        @JsonProperty("side") Short side,
        @JsonProperty("series") String series,
        @JsonProperty("user_name") String userName,
        @JsonProperty("participant") String participant,
        @JsonProperty("market") String market,
        @JsonProperty("account_id") String accountId,
        @JsonProperty("input_message_type") String inputMessageType,
        @JsonProperty("connector_port") Integer connectorPort,
        @JsonProperty("me_vrd_input_time")
        @JsonSerialize(using = ToStringSerializer.class) Long meVrdInputTime,
        @JsonProperty("me_vrd_output_time")
        @JsonSerialize(using = ToStringSerializer.class) Long meVrdOutputTime,
        @JsonProperty("me_net_input_time")
        @JsonSerialize(using = ToStringSerializer.class) Long meNetInputTime,
        @JsonProperty("me_net_output_time")
        @JsonSerialize(using = ToStringSerializer.class) Long meNetOutputTime,
        @JsonProperty("gw_net_input_time")
        @JsonSerialize(using = ToStringSerializer.class) Long gwNetInputTime,
        @JsonProperty("gw_net_output_time")
        @JsonSerialize(using = ToStringSerializer.class) Long gwNetOutputTime,
        @JsonProperty("me_asic_input_time")
        @JsonSerialize(using = ToStringSerializer.class) Long meAsicInputTime,
        @JsonProperty("me_asic_output_time")
        @JsonSerialize(using = ToStringSerializer.class) Long meAsicOutputTime,
        @JsonProperty("me_vrd_latency") Long meVrdLatency,
        @JsonProperty("me_net_latency") Long meNetLatency,
        @JsonProperty("gw_net_latency") Long gwNetLatency,
        @JsonProperty("me_asic_latency") Long meAsicLatency
) {
}
