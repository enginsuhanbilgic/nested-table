package com.bistech.reporting.repository.latency;

import com.bistech.reporting.model.latency.UserLatency;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

// The project-specific import for ProtocolTypes was collapsed in the screenshot.

public final class UserLatencySpecs {

    private static final Logger LOGGER = LoggerFactory.getLogger(UserLatencySpecs.class);

    private UserLatencySpecs() {
    }

    private static boolean hasText(final String s) {
        return s != null && !s.isBlank();
    }

    private static String containsPattern(final String value) {
        return "%" + value.toLowerCase(Locale.ROOT).trim() + "%";
    }

    public static Specification<UserLatency> dateEquals(final LocalDate date) {
        return (root, query, cb) -> {
            if (date == null) {
                return cb.conjunction();
            }

            return cb.equal(root.get("date"), date);
        };
    }

    public static Specification<UserLatency> queryStringContains(final String queryString) {
        return (root, query, cb) -> {
            if (!hasText(queryString)) {
                return cb.conjunction();
            }

            String pattern = containsPattern(queryString);

            Predicate nodePredicate =
                    cb.like(cb.lower(root.get("node")), pattern);
            Predicate participantPredicate =
                    cb.like(cb.lower(root.get("participantName")), pattern);
            Predicate usernamePredicate =
                    cb.like(cb.lower(root.get("username")), pattern);
            Predicate processPredicate =
                    cb.like(cb.lower(root.get("process")), pattern);

            return cb.or(
                    nodePredicate,
                    participantPredicate,
                    usernamePredicate,
                    processPredicate
            );
        };
    }

    public static Specification<UserLatency> partitionContains(final List<Short> partitions) {
        return (root, query, cb) -> {
            if (partitions == null || partitions.isEmpty()) {
                return cb.conjunction();
            }

            Path<Short> partition = root.get("partition");
            return partition.in(partitions);
        };
    }

    public static Specification<UserLatency> protocolContains(final List<String> protocols) {
        return (root, query, cb) -> {
            if (protocols == null || protocols.isEmpty()) {
                return cb.conjunction();
            }

            List<String> labels = protocols.stream()
                    .map(code -> {
                        try {
                            return ProtocolTypes.fromCode(code).label().toLowerCase();
                        } catch (IllegalArgumentException e) {
                            return null;
                        }
                    })
                    .filter(Objects::nonNull)
                    .toList();

            if (labels.isEmpty()) {
                return cb.disjunction();
            }

            return cb.lower(root.get("protocol")).in(labels);
        };
    }

    public static Specification<UserLatency> locationContains(final List<String> locations) {
        return (root, query, cb) -> {
            if (locations == null || locations.isEmpty()) {
                return cb.conjunction();
            }

            Expression<String> location = cb.lower(root.get("location"));
            return location.in(locations);
        };
    }
}
