package com.bistech.reporting.dto.latency;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.List;

/**
 * One /latency/nested/instance-users or /latency/nested/participant-users
 * row. JSON keys mirror the frontend NestedUserLatencyItem type.
 */
public record UserDailyResponse(
        @JsonProperty("name") String name,
        @JsonProperty("participant_name") String participantName,
        @JsonProperty("gw_node") String gwNode,
        @JsonProperty("node_instance") String nodeInstance,
        @JsonProperty("ports") List<Integer> ports,
        @JsonProperty("num_orders") Long numOrders,
        @JsonProperty("num_orders_in_peak_times") Long numOrdersInPeakTimes,
        @JsonProperty("peak_ratio") BigDecimal peakRatio,
        @JsonProperty("me_med") BigDecimal meMed,
        @JsonProperty("me_avg") BigDecimal meAvg,
        @JsonProperty("me_max") Long meMax,
        @JsonProperty("me_min") Long meMin,
        @JsonProperty("me_p99") BigDecimal meP99,
        @JsonProperty("gw_med") BigDecimal gwMed,
        @JsonProperty("gw_avg") BigDecimal gwAvg,
        @JsonProperty("gw_max") Long gwMax,
        @JsonProperty("gw_min") Long gwMin,
        @JsonProperty("gw_p99") BigDecimal gwP99
) {
}
