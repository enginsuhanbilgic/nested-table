package com.bistech.reporting.repository.latency;

import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Specifications for the nested latency grid entities (GatewayDaily,
 * InstanceDaily, ParticipantDaily, UserDaily, SeriesDaily and the four
 * *Minute entities).
 *
 * All of these entities deliberately share the same Java property names for
 * the common measures (date, numOrders, meMed .. gwP99), so every
 * specification here is generic over the entity type instead of being
 * duplicated nine times. Entity-specific keys (gatewayName, participantName,
 * nodeInstance, ...) are addressed through {@link #attributeEquals}.
 */
public final class GroupedLatencySpecs {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(GroupedLatencySpecs.class);

    /**
     * Threshold metric keys as sent by the frontend
     * (NestedLatencyMetricKey) -> entity property names.
     */
    private static final Map<String, String> METRIC_PROPERTY_BY_KEY =
            Map.ofEntries(
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

    private GroupedLatencySpecs() {
    }

    private static boolean hasText(final String s) {
        return s != null && !s.isBlank();
    }

    private static String containsPattern(final String value) {
        return "%" + value.toLowerCase(Locale.ROOT).trim() + "%";
    }

    /**
     * tx_date = :date. No-op when date is null (callers normalize a missing
     * date to "today" before building the spec).
     */
    public static <T> Specification<T> dateEquals(final LocalDate date) {
        return (root, query, cb) -> {
            if (date == null) {
                return cb.conjunction();
            }

            return cb.equal(root.get("date"), date);
        };
    }

    /**
     * num_orders >= :minOrders. No-op when minOrders is null or not positive
     * (the frontend only sends the parameter when it is > 0).
     */
    public static <T> Specification<T> minOrdersAtLeast(final Integer minOrders) {
        return (root, query, cb) -> {
            if (minOrders == null || minOrders <= 0) {
                return cb.conjunction();
            }

            return cb.ge(root.get("numOrders"), minOrders);
        };
    }

    /**
     * <metric> <op> :value where metric is a NestedLatencyMetricKey
     * ("me_med", "gw_p99", ...) and op is one of &gt;, &gt;=, &lt;, &lt;=.
     * Rows whose metric is NULL never match (standard SQL comparison
     * semantics). No-op when any of the three parts is missing; unknown
     * metrics/operators are logged and ignored rather than failing the
     * request.
     */
    public static <T> Specification<T> metricThreshold(
            final String metricKey,
            final String operator,
            final BigDecimal value
    ) {
        return (root, query, cb) -> {
            if (!hasText(metricKey) || !hasText(operator) || value == null) {
                return cb.conjunction();
            }

            String property = METRIC_PROPERTY_BY_KEY.get(metricKey.trim());
            if (property == null) {
                LOGGER.warn("Ignoring unknown threshold metric '{}'", metricKey);
                return cb.conjunction();
            }

            Path<Number> path = root.get(property);

            return switch (operator.trim()) {
                case ">" -> cb.gt(path, value);
                case ">=" -> cb.ge(path, value);
                case "<" -> cb.lt(path, value);
                case "<=" -> cb.le(path, value);
                default -> {
                    LOGGER.warn("Ignoring unknown threshold operator '{}'", operator);
                    yield cb.conjunction();
                }
            };
        };
    }

    /**
     * Case-insensitive "contains" over one or more string attributes
     * (OR-combined), used for the per-grid search box. No-op when the query
     * string is blank.
     */
    public static <T> Specification<T> queryStringContainsAny(
            final String queryString,
            final List<String> attributes
    ) {
        return (root, query, cb) -> {
            if (!hasText(queryString) || attributes == null || attributes.isEmpty()) {
                return cb.conjunction();
            }

            String pattern = containsPattern(queryString);

            Predicate[] predicates = attributes.stream()
                    .map(attribute -> cb.like(cb.lower(root.get(attribute)), pattern))
                    .toArray(Predicate[]::new);

            return cb.or(predicates);
        };
    }

    /**
     * Exact match on a string attribute -- used for the parent keys of child
     * fetches (gatewayName, nodeInstance, participantName) and for the minute
     * series lookups (name). These filters are REQUIRED by their endpoints,
     * so a blank value intentionally matches nothing instead of leaking the
     * whole table.
     */
    public static <T> Specification<T> attributeEquals(
            final String attribute,
            final String value
    ) {
        return (root, query, cb) -> {
            if (!hasText(value)) {
                return cb.disjunction();
            }

            return cb.equal(root.get(attribute), value);
        };
    }
}
