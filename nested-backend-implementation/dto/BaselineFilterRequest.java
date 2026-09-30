package com.bistech.reporting.dto.latency.grouped.filter;

import java.time.LocalDate;
import java.util.Objects;

public record BaselineFilterRequest(
        LocalDate date
) {

    public BaselineFilterRequest normalized() {
        LocalDate normalizedDate;
        normalizedDate = Objects.requireNonNullElseGet(date, LocalDate::now);

        return new BaselineFilterRequest(
                normalizedDate
        );
    }
}
