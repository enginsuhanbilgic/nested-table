package com.bistech.reporting.dto.transaction;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import java.util.List;

/**
 * Neighbor comparison result. rows is sorted by the scope's input time and
 * INCLUDES the reference order itself (identified by reference_commit_id) so
 * the grid renders the highlighted row in place without merging client-side.
 * window_ms / max_orders_per_side echo the clamped values actually applied.
 */
public record NeighborResponse(
        @JsonProperty("scope") String scope,
        @JsonProperty("window_ms") int windowMs,
        @JsonProperty("max_orders_per_side") int maxOrdersPerSide,
        // String in JSON: commit ids can exceed JS Number.MAX_SAFE_INTEGER.
        @JsonProperty("reference_commit_id")
        @JsonSerialize(using = ToStringSerializer.class) long referenceCommitId,
        @JsonProperty("rows") List<OrderPcapResponse> rows
) {
}
