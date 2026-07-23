// Transcribed from the provided screenshots.
// The package declaration and imports were not visible in the images.

@RestController
@RequestMapping("/api/latency")
@RequiredArgsConstructor
public class LatencyGeneralStatsController {

    private final GeneralLatencyService generalLatencyService;
    private final RttRangeService rttRangeService;
    private final UserLatencyService userLatencyService;
    private final GroupedLatencyService groupedLatencyService;

    @GetMapping("/getLatencyDailyAverageStats")
    public ResponseEntity<List<LatencyDailyResponse>> getDailyStats(
            final LatencyDailyFilterRequest filterRequest,
            final DateFilter dateFilter
    ) {
        return ResponseEntity.ok(
                generalLatencyService.getDailyLatencyStatsGroupedByDate(filterRequest, dateFilter)
        );
    }

    @GetMapping("/getLatencyMinuteStats")
    public ResponseEntity<List<LatencyMinuteResponse>> getDailyMinuteStats(
            final LatencyMinuteFilterRequest filterRequest
    ) {
        return ResponseEntity.ok(
                generalLatencyService.getMinuteLatencyStats(filterRequest)
        );
    }

    @GetMapping("/getRttRangeStats")
    public ResponseEntity<PageResponse<RttRangeResponse>> getRttRangeStats(
            final RttRangeFilterRequest filterRequest,
            final DateFilter dateFilter,
            final @PageableDefault(
                    sort = "date",
                    direction = Sort.Direction.ASC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        rttRangeService.getRttRangeBetweenDates(
                                filterRequest,
                                dateFilter,
                                pageable
                        )
                )
        );
    }

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

    @GetMapping("/nested/series-history")
    public ResponseEntity<List<SeriesHistoryResponse>> getSeriesHistoryStats(
            final SeriesHistoryFilterRequest filterRequest
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getSeriesHistoryStats(filterRequest)
                )
        );
    }

    @GetMapping("/nested/minute")
    public ResponseEntity<List<MinuteResponse>> getMinuteStats(
            final MinuteFilterRequest filterRequest
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getMinuteStats(filterRequest)
                )
        );
    }

    @GetMapping("/nested/freshness")
    public ResponseEntity<DataFreshnessResponse> getFreshnessStats() {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getFreshnessStats()
                )
        );
    }

    @GetMapping("/nested/baseline")
    public ResponseEntity<BaselineResponse> getBaselineStats(
            final BaselineFilterRequest filterRequest
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        groupedLatencyService.getBaselineStats(filterRequest)
                )
        );
    }
}
