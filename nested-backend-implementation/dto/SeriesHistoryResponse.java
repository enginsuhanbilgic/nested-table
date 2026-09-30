package com.bistech.reporting.dto.latency;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One day of a series' history (/latency/nested/series-history). JSON keys
 * mirror the frontend NestedLatencyDailyHistoryPoint type.
 */
public record SeriesHistoryResponse(
        @JsonProperty("date") LocalDate date,
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
