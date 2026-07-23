package com.bistech.reporting.dto.latency.grouped.filter;

import java.time.LocalDate;
import java.util.Objects;

import static com.bistech.reporting.util.FilterUtil.normalizeKey;

public record MinuteFilterRequest(
        LocalDate date,
        String entityType,
        String name,
        String participantName,
        String gatewayName,
        String instanceName
) {

    public MinuteFilterRequest normalized() {
        LocalDate normalizedDate;
        normalizedDate = Objects.requireNonNullElseGet(date, LocalDate::now);

        return new MinuteFilterRequest(
                normalizedDate,
                normalizeKey(entityType),
                normalizeKey(name),
                normalizeKey(participantName),
                normalizeKey(gatewayName),
                normalizeKey(instanceName)
        );
    }
}
