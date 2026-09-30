package com.bistech.reporting.dto.audit;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public record UserPageHistoryFilterRequest(
        UUID userId, List<String> roleCodeIn, String pagePath, String pageTitle,
        String referrer, String userAgent, String pagePathExact,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
) {
    public static final ZoneId ZONE = ZoneId.of("Europe/Istanbul");

    public UserPageHistoryFilterRequest normalized() {
        LocalDate end = to == null ? LocalDate.now(ZONE) : to;
        LocalDate start = from == null ? end.minusDays(6) : from;
        if (start.isAfter(end) || ChronoUnit.DAYS.between(start, end) >= 366) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Select an ordered date range of at most 366 days.");
        }
        List<String> roles = roleCodeIn == null ? List.of() : roleCodeIn.stream()
                .filter(s -> s != null && !s.isBlank())
                .map(s -> s.trim().toUpperCase(Locale.ROOT).replaceFirst("^ROLE_", ""))
                .distinct().toList();
        return new UserPageHistoryFilterRequest(userId, roles, clean(pagePath), clean(pageTitle),
                clean(referrer), clean(userAgent), clean(pagePathExact), start, end);
    }

    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
