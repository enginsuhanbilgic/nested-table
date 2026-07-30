package com.bistech.reporting.dto.transaction;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * One search (queue/history/cache row). requested_by and error_text are
 * deliberately not exposed. queue_position is filled only while QUEUED;
 * hint_dates only on NOT_FOUND when the order exists on other dates.
 * created_at is when the shared execution was enqueued; requested_at is when
 * THIS caller (last) asked for it -- filled on create and in the history
 * grid, null on the shared-link detail read.
 */
public record OrderSearchResponse(
        @JsonProperty("public_id") UUID publicId,
        // String in JSON: order ids can exceed JS Number.MAX_SAFE_INTEGER.
        @JsonProperty("order_id")
        @JsonSerialize(using = ToStringSerializer.class) Long orderId,
        @JsonProperty("tx_date") LocalDate txDate,
        @JsonProperty("status") String status,
        @JsonProperty("queue_position") Integer queuePosition,
        @JsonProperty("hint_dates") List<LocalDate> hintDates,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("requested_at") Instant requestedAt,
        @JsonProperty("finished_at") Instant finishedAt,
        @JsonProperty("result_count") Integer resultCount
) {
}
