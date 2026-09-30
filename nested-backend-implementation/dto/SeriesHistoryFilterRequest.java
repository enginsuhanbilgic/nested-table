package com.bistech.reporting.dto.latency.grouped.filter;

import static com.bistech.reporting.util.FilterUtil.normalizeKey;

public record SeriesHistoryFilterRequest(
        String name,
        Integer days
) {

    public SeriesHistoryFilterRequest normalized() {
        return new SeriesHistoryFilterRequest(
                normalizeKey(name),
                days == null ? 30 : days
        );
    }
}
