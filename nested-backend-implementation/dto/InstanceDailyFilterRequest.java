package com.bistech.reporting.dto.latency.grouped.filter;

import static com.bistech.reporting.util.FilterUtil.normalizeKey;

public record InstanceDailyFilterRequest(
        String gatewayName
) {

    public InstanceDailyFilterRequest normalized() {
        return new InstanceDailyFilterRequest(
                normalizeKey(gatewayName)
        );
    }
}
