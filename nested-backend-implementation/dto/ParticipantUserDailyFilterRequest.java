package com.bistech.reporting.dto.latency.grouped.filter;

import static com.bistech.reporting.util.FilterUtil.normalizeKey;

public record ParticipantUserDailyFilterRequest(
        String participantName
) {

    public ParticipantUserDailyFilterRequest normalized() {
        return new ParticipantUserDailyFilterRequest(
                normalizeKey(participantName)
        );
    }
}
