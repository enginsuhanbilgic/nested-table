package com.bistech.reporting.dto.latency.grouped.filter;

import static com.bistech.reporting.util.FilterUtil.normalizeKey;

public record InstanceUserDailyFilterRequest(
        String gatewayName,
        String instanceName
) {

    public InstanceUserDailyFilterRequest normalized() {
        return new InstanceUserDailyFilterRequest(
                normalizeKey(gatewayName),
                normalizeKey(instanceName)
        );
    }
}
