package com.bistech.reporting.dto.latency.grouped.filter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

import static com.bistech.reporting.util.FilterUtil.normalize;
import static com.bistech.reporting.util.FilterUtil.normalizeKey;

public record GeneralDailyFilterRequest(
        LocalDate date,
        Integer minOrders,
        String thresholdMetric,
        String thresholdOp,
        BigDecimal thresholdValue,
        String queryString
) {

    public GeneralDailyFilterRequest normalized() {
        LocalDate normalizedDate;
        normalizedDate = Objects.requireNonNullElseGet(date, LocalDate::now);

        return new GeneralDailyFilterRequest(
                normalizedDate,
                minOrders,
                normalizeKey(thresholdMetric),
                normalizeKey(thresholdOp),
                thresholdValue,
                normalize(queryString)
        );
    }
}
