package com.bistech.reporting.dto.transaction;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;

/**
 * POST /api/transaction/searches body. order_id travels as a STRING (bigint
 * ids exceed JS number precision, so the frontend never has it as a number)
 * and is validated/parsed in the service -- a malformed or Long-overflowing
 * value answers a clean 400 instead of a Jackson deserialization error.
 * tx_date is optional and defaults to the current trading date on the server.
 */
public record OrderSearchRequest(
        @JsonProperty("order_id") String orderId,
        @JsonProperty("tx_date") LocalDate txDate
) {
}
