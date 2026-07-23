package com.bistech.reporting.dto.latency;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * One minute bucket of a chart series (/latency/nested/series-minute).
 * JSON keys mirror the frontend NestedLatencySeriesPoint type.
 *
 * me_min / gw_min are always null: the stat.v_*_minute views do not expose
 * them (the underlying stat.latency_minute_stat table has the columns, so
 * extending the views would light these up without a frontend change).
 */
public record MinuteResponse(
        @JsonProperty("hour") Integer hour,
        @JsonProperty("minute") Integer minute,
        @JsonProperty("no_ord") Long noOrd,
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
