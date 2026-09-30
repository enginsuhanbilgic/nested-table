package com.bistech.reporting.dto.latency;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * /latency/nested/freshness payload: the trading day and timestamp of the
 * most recently advanced pipeline watermark. JSON keys mirror the frontend
 * DataFreshnessInfo type (updated_at serializes as ISO 8601 with Spring
 * Boot's default Jackson setup).
 */
public record DataFreshnessResponse(
        @JsonProperty("date") LocalDate date,
        @JsonProperty("updated_at") OffsetDateTime updatedAt
) {
}
