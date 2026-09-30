package com.bistech.reporting.dto.audit;

import com.bistech.reporting.model.audit.UserPageHistory;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;

public record UserPageHistoryResponse(
        Long id,
        UUID userId,
        String username,
        String pagePath,
        String pageTitle,
        OffsetDateTime visitTimestamp,
        String referrer,
        String userAgent
) {
    private static final ZoneId IST = ZoneId.of("Europe/Istanbul");

    public static UserPageHistoryResponse from(final UserPageHistory userPageHistory) {
        String username;
        if (userPageHistory.getUser() != null) {
            username = userPageHistory.getUser().getUsername();
        } else {
            username = null;
        }

        return new UserPageHistoryResponse(
                userPageHistory.getId(),
                userPageHistory.getUser() == null ? null : userPageHistory.getUser().getId(),
                username,
                userPageHistory.getPagePath(),
                userPageHistory.getPageTitle(),
                toIstanbul(userPageHistory.getVisitTimestamp()),
                userPageHistory.getReferrer(),
                userPageHistory.getUserAgent()
        );
    }

    private static OffsetDateTime toIstanbul(final Instant instant) {
        if (instant == null) {
            return null;
        } else {
            return OffsetDateTime.ofInstant(instant, IST);
        }
    }
}
