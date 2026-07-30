package com.bistech.reporting.dto.transaction;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;

/**
 * POST /api/transaction/searches body. tx_date is optional and defaults to
 * the current trading date on the server.
 */
public record OrderSearchRequest(
        @JsonProperty("order_id") Long orderId,
        @JsonProperty("tx_date") LocalDate txDate
) {
}
