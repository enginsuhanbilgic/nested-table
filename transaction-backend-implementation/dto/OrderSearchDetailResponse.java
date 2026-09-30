package com.bistech.reporting.dto.transaction;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * GET /api/transaction/searches/{publicId}: the search row plus (when DONE)
 * the matched order lineage. One payload serves both the polling loading
 * screen and the results screen -- hits is empty until status is DONE.
 */
public record OrderSearchDetailResponse(
        @JsonProperty("search") OrderSearchResponse search,
        @JsonProperty("hits") List<OrderPcapResponse> hits
) {
}
