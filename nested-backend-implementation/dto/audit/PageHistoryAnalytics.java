package com.bistech.reporting.dto.audit;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class PageHistoryAnalytics {
    private PageHistoryAnalytics() { }
    public record Summary(long visits, long uniqueUsers, long uniquePages, double visitsPerUser) { }
    /** bucket is YYYY-MM-DD for daily activity and HH for selected-day activity. */
    public record Activity(String bucket, long visits, long uniqueUsers) { }
    public record PageItem(String pagePath, String pageTitle, long visits, long uniqueUsers,
                           double sharePercent, OffsetDateTime lastVisit) { }
    public record UserItem(UUID userId, String username, long visits, long uniquePages,
                           OffsetDateTime lastVisit) { }
    public record Option(String id, String label) { }
}
