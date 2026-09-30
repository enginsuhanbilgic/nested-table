package com.bistech.reporting.dto.audit;

public record UserPageHistoryLoggingRequest(
        String pagePath,
        String pageTitle,
        String referrer
) { }
