package com.bistech.reporting.dto.latency;

import java.math.BigDecimal;
import java.time.LocalDate;

public record UserLatencyResponse(
        Long id,
        LocalDate date,
        String node,
        String participantName,
        String noParticipant,
        String username,
        Short partition,
        String process,
        String location,
        String protocol,
        Integer noUser,
        Integer noOrd,
        Integer noOrdInVolatile,
        BigDecimal ratio,
        Integer gwMed,
        Integer gwAvg,
        Integer gwMin,
        Integer gwMax,
        Integer meMed,
        Integer meAvg,
        Integer meMin,
        Integer meMax
) {
}
