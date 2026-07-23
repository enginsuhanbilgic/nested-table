package com.bistech.reporting.dto.latency;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * /latency/nested/baseline payload: exchange-wide reference latencies for a
 * day, used by the frontend for relative colour thresholds. JSON keys mirror
 * the frontend ExchangeBaseline type.
 */
public record BaselineResponse(
        @JsonProperty("date") LocalDate date,
        @JsonProperty("me_med") BigDecimal meMed,
        @JsonProperty("me_p99") BigDecimal meP99,
        @JsonProperty("gw_med") BigDecimal gwMed,
        @JsonProperty("gw_p99") BigDecimal gwP99
) {
}
