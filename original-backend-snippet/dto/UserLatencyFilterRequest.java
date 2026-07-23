package com.bistech.reporting.dto.latency;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

// The project-specific static imports that provide normalize(...),
// normalizeList(...), and normalizeStringArrayToList(...) were collapsed
// in the screenshot.

public record UserLatencyFilterRequest(
        LocalDate date,
        String queryString,
        List<Short> partitions,
        List<String> protocols,
        List<String> locations
) {

    public UserLatencyFilterRequest normalized() {
        LocalDate normalizedDate =
                Objects.requireNonNullElseGet(date, LocalDate::now);

        return new UserLatencyFilterRequest(
                normalizedDate,
                normalize(queryString),
                normalizeList(partitions),
                normalizeStringArrayToList(protocols),
                normalizeStringArrayToList(locations)
        );
    }
}
