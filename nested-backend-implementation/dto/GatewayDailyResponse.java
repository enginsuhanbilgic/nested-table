package com.bistech.reporting.dto.latency;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * One /latency/nested/gateways row. JSON keys mirror the frontend
 * GatewayLatencyItem type (snake_case, matching the stat.v_gateway_daily
 * columns).
 */
public record GatewayDailyResponse(
        @JsonProperty("name") String name,
        @JsonProperty("num_instances") Integer numInstances,
        @JsonProperty("num_users") Integer numUsers,
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
