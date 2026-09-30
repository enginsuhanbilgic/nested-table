package com.bistech.reporting.controller;

// NOTE: this is the transcribed controller with two corrections needed for
// the Nested Latency Explorer frontend (marked FIX below). Diff it against
// the real controller in the project; adjust imports to actual packages.

import com.bistech.reporting.dto.PageResponse;
import com.bistech.reporting.dto.latency.BaselineFilterRequest;
import com.bistech.reporting.dto.latency.BaselineResponse;
import com.bistech.reporting.dto.latency.DataFreshnessResponse;
import com.bistech.reporting.dto.latency.GatewayDailyResponse;
import com.bistech.reporting.dto.latency.GeneralDailyFilterRequest;
import com.bistech.reporting.dto.latency.InstanceDailyFilterRequest;
import com.bistech.reporting.dto.latency.InstanceDailyResponse;
import com.bistech.reporting.dto.latency.InstanceUserDailyFilterRequest;
import com.bistech.reporting.dto.latency.MinuteFilterRequest;
import com.bistech.reporting.dto.latency.MinuteResponse;
import com.bistech.reporting.dto.latency.ParticipantDailyResponse;
import com.bistech.reporting.dto.latency.ParticipantUserDailyFilterRequest;
import com.bistech.reporting.dto.latency.SeriesDailyResponse;
import com.bistech.reporting.dto.latency.SeriesHistoryFilterRequest;
import com.bistech.reporting.dto.latency.SeriesHistoryResponse;
import com.bistech.reporting.dto.latency.UserDailyResponse;
import com.bistech.reporting.dto.latency.UserLatencyFilterRequest;
import com.bistech.reporting.dto.latency.UserLatencyResponse;
import com.bistech.reporting.service.GeneralLatencyService;
import com.bistech.reporting.service.GroupedLatencyService;
import com.bistech.reporting.service.RttRangeService;
import com.bistech.reporting.service.UserLatencyService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/latency")
@RequiredArgsConstructor
public class LatencyGeneralStatsController {

    private final GeneralLatencyService generalLatencyService;
    private final RttRangeService rttRangeService;
    private final UserLatencyService userLatencyService;
    private final GroupedLatencyService groupedLatencyService;

    // ... legacy endpoints (getLatencyDailyAverageStats, getLatencyMinuteStats,
    // getRttRangeStats) unchanged -- omitted here, keep the existing ones ...

    @GetMapping("/getUserLatencyStats")
    public ResponseEntity<PageResponse<UserLatencyResponse>> getUserLatencyStats(
            final UserLatencyFilterRequest filterRequest,
            final @PageableDefault(
                    sort = "username",
                    direction = Sort.Direction.ASC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        userLatencyService.getUserLatencyStats(
                                filterRequest,
                                pageable
                        )
                )
        );
    }

    @GetMapping("/nested/gateways")
    public ResponseEntity<PageResponse<GatewayDailyResponse>> getGatewayDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final @PageableDefault(
                    sort = "name",
                    direction = Sort.Direction.ASC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getGatewayDailyStats(
                                generalFilter,
                                pageable
                        )
                )
        );
    }

    @GetMapping("/nested/gateway-instances")
    public ResponseEntity<PageResponse<InstanceDailyResponse>> getGatewayInstanceDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final InstanceDailyFilterRequest instanceFilter,
            final @PageableDefault(
                    sort = "name",
                    direction = Sort.Direction.ASC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getInstanceDailyStats(
                                generalFilter,
                                instanceFilter,
                                pageable
                        )
                )
        );
    }

    @GetMapping("/nested/instance-users")
    public ResponseEntity<PageResponse<UserDailyResponse>> getInstanceUserDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final InstanceUserDailyFilterRequest instanceUserFilter,
            final @PageableDefault(
                    sort = "name",
                    direction = Sort.Direction.ASC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getInstanceUserDailyStats(
                                generalFilter,
                                instanceUserFilter,
                                pageable
                        )
                )
        );
    }

    @GetMapping("/nested/participants")
    public ResponseEntity<PageResponse<ParticipantDailyResponse>> getParticipantDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final @PageableDefault(
                    sort = "name",
                    direction = Sort.Direction.ASC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getParticipantDailyStats(
                                generalFilter,
                                pageable
                        )
                )
        );
    }

    @GetMapping("/nested/participant-users")
    public ResponseEntity<PageResponse<UserDailyResponse>> getParticipantUserDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final ParticipantUserDailyFilterRequest participantUserFilter,
            final @PageableDefault(
                    sort = "name",
                    direction = Sort.Direction.ASC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getParticipantUserDailyStats(
                                generalFilter,
                                participantUserFilter,
                                pageable
                        )
                )
        );
    }

    @GetMapping("/nested/series")
    public ResponseEntity<PageResponse<SeriesDailyResponse>> getSeriesDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final @PageableDefault(
                    sort = "name",
                    direction = Sort.Direction.ASC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getSeriesDailyStats(
                                generalFilter,
                                pageable
                        )
                )
        );
    }

    // FIX: list payload -- no PageResponse.of() wrapper (would not compile
    // against the declared return type).
    @GetMapping("/nested/series-history")
    public ResponseEntity<List<SeriesHistoryResponse>> getSeriesHistoryStats(
            final SeriesHistoryFilterRequest filterRequest
    ) {
        return ResponseEntity.ok(
                groupedLatencyService.getSeriesHistoryStats(filterRequest)
        );
    }

    // FIX: path is /nested/series-minute (the frontend latencyService.ts
    // calls this), not /nested/minute; list payload -- no PageResponse.of().
    @GetMapping("/nested/series-minute")
    public ResponseEntity<List<MinuteResponse>> getMinuteStats(
            final MinuteFilterRequest filterRequest
    ) {
        return ResponseEntity.ok(
                groupedLatencyService.getMinuteStats(filterRequest)
        );
    }

    // FIX: single payload -- no PageResponse.of().
    @GetMapping("/nested/freshness")
    public ResponseEntity<DataFreshnessResponse> getFreshnessStats() {
        return ResponseEntity.ok(
                groupedLatencyService.getFreshnessStats()
        );
    }

    // FIX: single payload -- no PageResponse.of().
    @GetMapping("/nested/baseline")
    public ResponseEntity<BaselineResponse> getBaselineStats(
            final BaselineFilterRequest filterRequest
    ) {
        return ResponseEntity.ok(
                groupedLatencyService.getBaselineStats(filterRequest)
        );
    }
}
