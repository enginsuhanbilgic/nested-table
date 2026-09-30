package com.bistech.reporting.service;

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
import com.bistech.reporting.model.latency.GatewayDaily;
import com.bistech.reporting.model.latency.GatewayMinute;
import com.bistech.reporting.model.latency.InstanceDaily;
import com.bistech.reporting.model.latency.InstanceMinute;
import com.bistech.reporting.model.latency.ParticipantDaily;
import com.bistech.reporting.model.latency.ParticipantMinute;
import com.bistech.reporting.model.latency.SeriesDaily;
import com.bistech.reporting.model.latency.UserDaily;
import com.bistech.reporting.model.latency.UserMinute;
import com.bistech.reporting.repository.latency.BaselineRepository;
import com.bistech.reporting.repository.latency.DataFreshnessRepository;
import com.bistech.reporting.repository.latency.GatewayDailyRepository;
import com.bistech.reporting.repository.latency.GatewayMinuteRepository;
import com.bistech.reporting.repository.latency.GroupedLatencySpecs;
import com.bistech.reporting.repository.latency.InstanceDailyRepository;
import com.bistech.reporting.repository.latency.InstanceMinuteRepository;
import com.bistech.reporting.repository.latency.ParticipantDailyRepository;
import com.bistech.reporting.repository.latency.ParticipantMinuteRepository;
import com.bistech.reporting.repository.latency.SeriesDailyRepository;
import com.bistech.reporting.repository.latency.UserDailyRepository;
import com.bistech.reporting.repository.latency.UserMinuteRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Serves the /latency/nested/* endpoints backing the Nested Latency Explorer:
 * two lazily-expanded hierarchies (gateway -> instance -> user and
 * participant -> user), the series leaderboard + daily history, per-entity
 * minute charts, data freshness and the exchange-wide baseline.
 *
 * All grid endpoints are server-side paged and sorted; the frontend sends
 * grid field names (snake_case, e.g. "me_med") which are remapped here to
 * entity properties before hitting Spring Data.
 */
@Service
@RequiredArgsConstructor
public class GroupedLatencyService {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(GroupedLatencyService.class);

    private static final int DEFAULT_PAGE_SIZE = 25;
    private static final int DEFAULT_HISTORY_DAYS = 90;
    private static final int MAX_HISTORY_DAYS = 370;

    private static final Sort MINUTE_ORDER =
            Sort.by(Sort.Order.asc("hour"), Sort.Order.asc("minute"));

    /**
     * Grid sort fields as sent by the frontend -> entity property names.
     * Entity-native property names also pass through untouched.
     */
    private static final Map<String, String> SORT_PROPERTY_BY_API_FIELD =
            Map.ofEntries(
                    Map.entry("name", "name"),
                    Map.entry("gateway_name", "gatewayName"),
                    Map.entry("participant_name", "participantName"),
                    Map.entry("gw_node", "gwNode"),
                    Map.entry("node_instance", "nodeInstance"),
                    Map.entry("num_instances", "numInstances"),
                    Map.entry("num_users", "numUsers"),
                    Map.entry("num_orders", "numOrders"),
                    Map.entry("num_orders_in_peak_times", "numOrdersInPeakTimes"),
                    Map.entry("peak_ratio", "peakRatio"),
                    Map.entry("me_med", "meMed"),
                    Map.entry("me_avg", "meAvg"),
                    Map.entry("me_max", "meMax"),
                    Map.entry("me_min", "meMin"),
                    Map.entry("me_p99", "meP99"),
                    Map.entry("gw_med", "gwMed"),
                    Map.entry("gw_avg", "gwAvg"),
                    Map.entry("gw_max", "gwMax"),
                    Map.entry("gw_min", "gwMin"),
                    Map.entry("gw_p99", "gwP99")
            );

    // Sortable entity properties per grid. Both hierarchy grids share one
    // sort model across all levels, so a sort field that does not exist on
    // the entity being paged (e.g. "participant_name" while fetching gateway
    // roots) is silently dropped instead of failing the request.
    private static final Set<String> GATEWAY_SORT_PROPERTIES =
            withCommonSortProperties("numInstances", "numUsers", "peakRatio");
    private static final Set<String> INSTANCE_SORT_PROPERTIES =
            withCommonSortProperties("gatewayName", "numUsers", "peakRatio");
    private static final Set<String> PARTICIPANT_SORT_PROPERTIES =
            withCommonSortProperties("numUsers", "peakRatio");
    private static final Set<String> USER_SORT_PROPERTIES =
            withCommonSortProperties("participantName", "gwNode", "nodeInstance", "peakRatio");
    private static final Set<String> SERIES_SORT_PROPERTIES =
            withCommonSortProperties("numUsers");

    // Attributes the per-grid search box matches against, per entity.
    private static final List<String> GATEWAY_QUERY_ATTRIBUTES =
            List.of("name");
    private static final List<String> INSTANCE_QUERY_ATTRIBUTES =
            List.of("name");
    private static final List<String> PARTICIPANT_QUERY_ATTRIBUTES =
            List.of("name");
    private static final List<String> INSTANCE_USER_QUERY_ATTRIBUTES =
            List.of("name", "participantName");
    private static final List<String> PARTICIPANT_USER_QUERY_ATTRIBUTES =
            List.of("name", "gwNode", "nodeInstance");
    private static final List<String> SERIES_QUERY_ATTRIBUTES =
            List.of("name");

    private final GatewayDailyRepository gatewayDailyRepository;
    private final InstanceDailyRepository instanceDailyRepository;
    private final ParticipantDailyRepository participantDailyRepository;
    private final UserDailyRepository userDailyRepository;
    private final SeriesDailyRepository seriesDailyRepository;
    private final GatewayMinuteRepository gatewayMinuteRepository;
    private final InstanceMinuteRepository instanceMinuteRepository;
    private final ParticipantMinuteRepository participantMinuteRepository;
    private final UserMinuteRepository userMinuteRepository;
    private final DataFreshnessRepository dataFreshnessRepository;
    private final BaselineRepository baselineRepository;

    ///
    /// Daily grids
    ///

    public Page<GatewayDailyResponse> getGatewayDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final Pageable pageable
    ) {
        GeneralDailyFilterRequest filter = normalizeGeneral(generalFilter);

        Specification<GatewayDaily> spec =
                dailySpec(filter, GATEWAY_QUERY_ATTRIBUTES);

        return gatewayDailyRepository
                .findAll(spec, remapSort(pageable, GATEWAY_SORT_PROPERTIES))
                .map(GroupedLatencyService::toGatewayResponse);
    }

    public Page<InstanceDailyResponse> getInstanceDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final InstanceDailyFilterRequest instanceFilter,
            final Pageable pageable
    ) {
        GeneralDailyFilterRequest filter = normalizeGeneral(generalFilter);
        String gatewayName =
                instanceFilter == null ? null : trimToNull(instanceFilter.gatewayName());

        if (gatewayName == null) {
            LOGGER.warn("gateway-instances requested without gatewayName");
            return Page.empty(safePageable(pageable));
        }

        Specification<InstanceDaily> spec =
                dailySpec(filter, INSTANCE_QUERY_ATTRIBUTES);
        spec = spec.and(
                GroupedLatencySpecs.attributeEquals("gatewayName", gatewayName));

        return instanceDailyRepository
                .findAll(spec, remapSort(pageable, INSTANCE_SORT_PROPERTIES))
                .map(GroupedLatencyService::toInstanceResponse);
    }

    public Page<UserDailyResponse> getInstanceUserDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final InstanceUserDailyFilterRequest instanceUserFilter,
            final Pageable pageable
    ) {
        GeneralDailyFilterRequest filter = normalizeGeneral(generalFilter);
        String gatewayName = instanceUserFilter == null
                ? null : trimToNull(instanceUserFilter.gatewayName());
        String instanceName = instanceUserFilter == null
                ? null : trimToNull(instanceUserFilter.instanceName());

        if (gatewayName == null || instanceName == null) {
            LOGGER.warn("instance-users requested without gatewayName/instanceName");
            return Page.empty(safePageable(pageable));
        }

        Specification<UserDaily> spec =
                dailySpec(filter, INSTANCE_USER_QUERY_ATTRIBUTES);
        spec = spec
                .and(GroupedLatencySpecs.attributeEquals("gwNode", gatewayName))
                .and(GroupedLatencySpecs.attributeEquals("nodeInstance", instanceName));

        return userDailyRepository
                .findAll(spec, remapSort(pageable, USER_SORT_PROPERTIES))
                .map(GroupedLatencyService::toUserResponse);
    }

    public Page<ParticipantDailyResponse> getParticipantDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final Pageable pageable
    ) {
        GeneralDailyFilterRequest filter = normalizeGeneral(generalFilter);

        Specification<ParticipantDaily> spec =
                dailySpec(filter, PARTICIPANT_QUERY_ATTRIBUTES);

        return participantDailyRepository
                .findAll(spec, remapSort(pageable, PARTICIPANT_SORT_PROPERTIES))
                .map(GroupedLatencyService::toParticipantResponse);
    }

    public Page<UserDailyResponse> getParticipantUserDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final ParticipantUserDailyFilterRequest participantUserFilter,
            final Pageable pageable
    ) {
        GeneralDailyFilterRequest filter = normalizeGeneral(generalFilter);
        String participantName = participantUserFilter == null
                ? null : trimToNull(participantUserFilter.participantName());

        if (participantName == null) {
            LOGGER.warn("participant-users requested without participantName");
            return Page.empty(safePageable(pageable));
        }

        Specification<UserDaily> spec =
                dailySpec(filter, PARTICIPANT_USER_QUERY_ATTRIBUTES);
        spec = spec.and(
                GroupedLatencySpecs.attributeEquals("participantName", participantName));

        return userDailyRepository
                .findAll(spec, remapSort(pageable, USER_SORT_PROPERTIES))
                .map(GroupedLatencyService::toUserResponse);
    }

    public Page<SeriesDailyResponse> getSeriesDailyStats(
            final GeneralDailyFilterRequest generalFilter,
            final Pageable pageable
    ) {
        GeneralDailyFilterRequest filter = normalizeGeneral(generalFilter);

        Specification<SeriesDaily> spec =
                dailySpec(filter, SERIES_QUERY_ATTRIBUTES);

        return seriesDailyRepository
                .findAll(spec, remapSort(pageable, SERIES_SORT_PROPERTIES))
                .map(GroupedLatencyService::toSeriesResponse);
    }

    ///
    /// Charts
    ///

    public List<MinuteResponse> getMinuteStats(final MinuteFilterRequest filterRequest) {
        MinuteFilterRequest filter = Objects.requireNonNullElseGet(
                filterRequest,
                () -> new MinuteFilterRequest(null, null, null, null, null, null)
        ).normalized();

        if (filter.entityType() == null || filter.name() == null) {
            return List.of();
        }

        switch (filter.entityType()) {
            case "gateway": {
                Specification<GatewayMinute> spec =
                        minuteSpec(filter.date(), filter.name());
                return gatewayMinuteRepository.findAll(spec, MINUTE_ORDER).stream()
                        .map(GroupedLatencyService::toMinuteResponse)
                        .toList();
            }
            case "instance": {
                // v_instance_minute is keyed by (gateway_name, name); a
                // missing gatewayName intentionally matches nothing.
                Specification<InstanceMinute> spec =
                        minuteSpec(filter.date(), filter.name());
                spec = spec.and(GroupedLatencySpecs.attributeEquals(
                        "gatewayName", filter.gatewayName()));
                return instanceMinuteRepository.findAll(spec, MINUTE_ORDER).stream()
                        .map(GroupedLatencyService::toMinuteResponse)
                        .toList();
            }
            case "participant": {
                Specification<ParticipantMinute> spec =
                        minuteSpec(filter.date(), filter.name());
                return participantMinuteRepository.findAll(spec, MINUTE_ORDER).stream()
                        .map(GroupedLatencyService::toMinuteResponse)
                        .toList();
            }
            case "user": {
                Specification<UserMinute> spec =
                        minuteSpec(filter.date(), filter.name());
                return userMinuteRepository.findAll(spec, MINUTE_ORDER).stream()
                        .map(GroupedLatencyService::toMinuteResponse)
                        .toList();
            }
            default:
                // "series" has no minute grain; unknown types get nothing.
                return List.of();
        }
    }

    public List<SeriesHistoryResponse> getSeriesHistoryStats(
            final SeriesHistoryFilterRequest filterRequest
    ) {
        String name =
                filterRequest == null ? null : trimToNull(filterRequest.name());
        if (name == null) {
            return List.of();
        }

        int days = filterRequest.days() == null || filterRequest.days() <= 0
                ? DEFAULT_HISTORY_DAYS
                : Math.min(filterRequest.days(), MAX_HISTORY_DAYS);

        LocalDate from = LocalDate.now().minusDays(days);

        return seriesDailyRepository
                .findByNameAndDateGreaterThanEqualOrderByDateAsc(name, from)
                .stream()
                .map(GroupedLatencyService::toSeriesHistoryResponse)
                .toList();
    }

    ///
    /// Meta
    ///

    /**
     * Freshness = the most recently advanced pipeline watermark, read from
     * stat.v_latency_load_watermark (already reduced to one row: latest day,
     * max updated_at). Returns null when nothing has loaded yet; the
     * frontend treats a missing payload as "no freshness hint".
     */
    public DataFreshnessResponse getFreshnessStats() {
        return dataFreshnessRepository.findTopByOrderByUpdatedAtDesc()
                .map(freshness -> new DataFreshnessResponse(
                        freshness.getDate(),
                        freshness.getUpdatedAt()))
                .orElse(null);
    }

    /**
     * Exchange-wide baseline for a day, used by the frontend to colour cells
     * relative to "normal". Served from stat.v_baseline_stat, which takes
     * the MEDIAN of the per-user daily medians/p99s -- a typical user's
     * typical latency, robust to outliers. A day with no baseline row still
     * answers with the date and null metrics (the frontend then falls back
     * to its absolute colour thresholds).
     */
    public BaselineResponse getBaselineStats(final BaselineFilterRequest filterRequest) {
        LocalDate date = filterRequest == null || filterRequest.date() == null
                ? LocalDate.now()
                : filterRequest.date();

        return baselineRepository.findByDate(date)
                .map(baseline -> new BaselineResponse(
                        date,
                        baseline.getMeMed(),
                        baseline.getMeP99(),
                        baseline.getGwMed(),
                        baseline.getGwP99()))
                .orElseGet(() -> new BaselineResponse(date, null, null, null, null));
    }

    ///
    /// Spec / paging helpers
    ///

    private static GeneralDailyFilterRequest normalizeGeneral(
            final GeneralDailyFilterRequest filterRequest
    ) {
        return Objects.requireNonNullElseGet(
                filterRequest,
                () -> new GeneralDailyFilterRequest(null, null, null, null, null, null)
        ).normalized();
    }

    private static <T> Specification<T> dailySpec(
            final GeneralDailyFilterRequest filter,
            final List<String> queryAttributes
    ) {
        return Specification.<T>unrestricted()
                .and(GroupedLatencySpecs.dateEquals(filter.date()))
                .and(GroupedLatencySpecs.minOrdersAtLeast(filter.minOrders()))
                .and(GroupedLatencySpecs.metricThreshold(
                        filter.thresholdMetric(),
                        filter.thresholdOp(),
                        filter.thresholdValue()))
                .and(GroupedLatencySpecs.queryStringContainsAny(
                        filter.queryString(),
                        queryAttributes));
    }

    private static <T> Specification<T> minuteSpec(
            final LocalDate date,
            final String name
    ) {
        return Specification.<T>unrestricted()
                .and(GroupedLatencySpecs.dateEquals(date))
                .and(GroupedLatencySpecs.attributeEquals("name", name));
    }

    private static Pageable safePageable(final Pageable pageable) {
        return pageable != null && pageable.isPaged()
                ? pageable
                : PageRequest.of(0, DEFAULT_PAGE_SIZE);
    }

    /**
     * Rewrites the incoming sort (frontend grid field names) onto entity
     * properties, drops fields the entity does not have, and appends a
     * "name asc" tiebreaker so infinite-scroll pages stay stable when the
     * primary sort has ties (metric columns often do).
     */
    private static Pageable remapSort(
            final Pageable pageable,
            final Set<String> sortableProperties
    ) {
        Pageable safe = safePageable(pageable);

        List<Sort.Order> orders = new ArrayList<>();
        for (Sort.Order order : safe.getSort()) {
            String property = SORT_PROPERTY_BY_API_FIELD
                    .getOrDefault(order.getProperty(), order.getProperty());
            if (!sortableProperties.contains(property)) {
                LOGGER.debug("Dropping unsupported sort field '{}'", order.getProperty());
                continue;
            }
            orders.add(new Sort.Order(order.getDirection(), property));
        }

        if (orders.stream().noneMatch(order -> "name".equals(order.getProperty()))) {
            orders.add(Sort.Order.asc("name"));
        }

        return PageRequest.of(
                safe.getPageNumber(),
                safe.getPageSize(),
                Sort.by(orders)
        );
    }

    private static Set<String> withCommonSortProperties(final String... extras) {
        Set<String> properties = new HashSet<>(List.of(
                "name", "numOrders", "numOrdersInPeakTimes",
                "meMed", "meAvg", "meMax", "meMin", "meP99",
                "gwMed", "gwAvg", "gwMax", "gwMin", "gwP99"
        ));
        properties.addAll(Arrays.asList(extras));
        return Set.copyOf(properties);
    }

    private static String trimToNull(final String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    ///
    /// Response mapping
    ///

    private static GatewayDailyResponse toGatewayResponse(final GatewayDaily entity) {
        return new GatewayDailyResponse(
                entity.getName(),
                entity.getNumInstances(),
                entity.getNumUsers(),
                entity.getNumOrders(),
                entity.getNumOrdersInPeakTimes(),
                entity.getPeakRatio(),
                entity.getMeMed(),
                entity.getMeAvg(),
                entity.getMeMax(),
                entity.getMeMin(),
                entity.getMeP99(),
                entity.getGwMed(),
                entity.getGwAvg(),
                entity.getGwMax(),
                entity.getGwMin(),
                entity.getGwP99()
        );
    }

    private static InstanceDailyResponse toInstanceResponse(final InstanceDaily entity) {
        return new InstanceDailyResponse(
                entity.getName(),
                entity.getGatewayName(),
                entity.getNumUsers(),
                entity.getNumOrders(),
                entity.getNumOrdersInPeakTimes(),
                entity.getPeakRatio(),
                entity.getMeMed(),
                entity.getMeAvg(),
                entity.getMeMax(),
                entity.getMeMin(),
                entity.getMeP99(),
                entity.getGwMed(),
                entity.getGwAvg(),
                entity.getGwMax(),
                entity.getGwMin(),
                entity.getGwP99()
        );
    }

    private static ParticipantDailyResponse toParticipantResponse(
            final ParticipantDaily entity
    ) {
        return new ParticipantDailyResponse(
                entity.getName(),
                entity.getNumUsers(),
                entity.getNumOrders(),
                entity.getNumOrdersInPeakTimes(),
                entity.getPeakRatio(),
                entity.getMeMed(),
                entity.getMeAvg(),
                entity.getMeMax(),
                entity.getMeMin(),
                entity.getMeP99(),
                entity.getGwMed(),
                entity.getGwAvg(),
                entity.getGwMax(),
                entity.getGwMin(),
                entity.getGwP99()
        );
    }

    private static UserDailyResponse toUserResponse(final UserDaily entity) {
        return new UserDailyResponse(
                entity.getName(),
                entity.getParticipantName(),
                entity.getGwNode(),
                entity.getNodeInstance(),
                entity.getPorts() == null ? List.of() : entity.getPorts(),
                entity.getNumOrders(),
                entity.getNumOrdersInPeakTimes(),
                entity.getPeakRatio(),
                entity.getMeMed(),
                entity.getMeAvg(),
                entity.getMeMax(),
                entity.getMeMin(),
                entity.getMeP99(),
                entity.getGwMed(),
                entity.getGwAvg(),
                entity.getGwMax(),
                entity.getGwMin(),
                entity.getGwP99()
        );
    }

    private static SeriesDailyResponse toSeriesResponse(final SeriesDaily entity) {
        return new SeriesDailyResponse(
                entity.getName(),
                entity.getNumUsers(),
                entity.getNumOrders(),
                entity.getNumOrdersInPeakTimes(),
                derivePeakRatio(entity.getNumOrdersInPeakTimes(), entity.getNumOrders()),
                entity.getMeMed(),
                entity.getMeAvg(),
                entity.getMeMax(),
                entity.getMeMin(),
                entity.getMeP99(),
                entity.getGwMed(),
                entity.getGwAvg(),
                entity.getGwMax(),
                entity.getGwMin(),
                entity.getGwP99()
        );
    }

    private static SeriesHistoryResponse toSeriesHistoryResponse(
            final SeriesDaily entity
    ) {
        return new SeriesHistoryResponse(
                entity.getDate(),
                entity.getNumOrders(),
                entity.getMeMed(),
                entity.getMeAvg(),
                entity.getMeMax(),
                entity.getMeMin(),
                entity.getMeP99(),
                entity.getGwMed(),
                entity.getGwAvg(),
                entity.getGwMax(),
                entity.getGwMin(),
                entity.getGwP99()
        );
    }

    private static MinuteResponse toMinuteResponse(final GatewayMinute entity) {
        return minuteResponse(
                entity.getHour(), entity.getMinute(), entity.getNoOrd(),
                entity.getMeMed(), entity.getMeAvg(), entity.getMeMax(), entity.getMeP99(),
                entity.getGwMed(), entity.getGwAvg(), entity.getGwMax(), entity.getGwP99());
    }

    private static MinuteResponse toMinuteResponse(final InstanceMinute entity) {
        return minuteResponse(
                entity.getHour(), entity.getMinute(), entity.getNoOrd(),
                entity.getMeMed(), entity.getMeAvg(), entity.getMeMax(), entity.getMeP99(),
                entity.getGwMed(), entity.getGwAvg(), entity.getGwMax(), entity.getGwP99());
    }

    private static MinuteResponse toMinuteResponse(final ParticipantMinute entity) {
        return minuteResponse(
                entity.getHour(), entity.getMinute(), entity.getNoOrd(),
                entity.getMeMed(), entity.getMeAvg(), entity.getMeMax(), entity.getMeP99(),
                entity.getGwMed(), entity.getGwAvg(), entity.getGwMax(), entity.getGwP99());
    }

    private static MinuteResponse toMinuteResponse(final UserMinute entity) {
        return minuteResponse(
                entity.getHour(), entity.getMinute(), entity.getNoOrd(),
                entity.getMeMed(), entity.getMeAvg(), entity.getMeMax(), entity.getMeP99(),
                entity.getGwMed(), entity.getGwAvg(), entity.getGwMax(), entity.getGwP99());
    }

    private static MinuteResponse minuteResponse(
            final Integer hour, final Integer minute, final Long noOrd,
            final BigDecimal meMed, final BigDecimal meAvg,
            final Long meMax, final BigDecimal meP99,
            final BigDecimal gwMed, final BigDecimal gwAvg,
            final Long gwMax, final BigDecimal gwP99
    ) {
        // me_min / gw_min are null: the minute views do not expose them.
        return new MinuteResponse(
                hour, minute, noOrd,
                meMed, meAvg, meMax, null, meP99,
                gwMed, gwAvg, gwMax, null, gwP99
        );
    }

    ///
    /// Numeric helpers
    ///

    private static BigDecimal derivePeakRatio(
            final Long peakOrders,
            final Long totalOrders
    ) {
        if (peakOrders == null || totalOrders == null || totalOrders <= 0) {
            return null;
        }
        return BigDecimal.valueOf(peakOrders)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(totalOrders), 2, RoundingMode.HALF_UP);
    }

}
