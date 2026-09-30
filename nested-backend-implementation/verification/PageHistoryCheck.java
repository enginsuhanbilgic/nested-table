import com.bistech.reporting.controller.AnalyticsController;
import com.bistech.reporting.dto.audit.UserPageHistoryFilterRequest;
import com.bistech.reporting.repository.UserPageHistorySpecs;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Offline checks; database integration is covered separately by PageHistoryDatabaseCheck. */
public class PageHistoryCheck {
    public static void main(String[] args) {
        var filter = new UserPageHistoryFilterRequest(UUID.randomUUID(), List.of("role_analytics", "ADMIN", "ADMIN"),
                "  /x%_!  ", null, null, null, "/x", LocalDate.parse("2026-09-23"), LocalDate.parse("2026-09-23"));
        var normalized = filter.normalized();
        check(normalized.roleCodeIn().equals(List.of("ANALYTICS", "ADMIN")), "role normalization");
        var query = UserPageHistorySpecs.of(filter);
        check(((OffsetDateTime) query.params().getValue("from")).toInstant().equals(Instant.parse("2026-09-22T21:00:00Z")), "Istanbul start");
        check(((OffsetDateTime) query.params().getValue("until")).toInstant().equals(Instant.parse("2026-09-23T21:00:00Z")), "exclusive next-day end");
        check(query.params().getValue("path").equals("%/x!%!_!!%"), "literal wildcard escaping");
        check(query.sql().contains("EXISTS") && !query.sql().contains("roleAssignments"), "current-role existence predicate");
        try {
            new UserPageHistoryFilterRequest(null, null, null, null, null, null, null,
                    LocalDate.parse("2026-09-24"), LocalDate.parse("2026-09-23")).normalized();
            throw new AssertionError("reversed dates accepted");
        } catch (ResponseStatusException expected) {
            check(expected.getStatusCode().value() == 400, "date validation status");
        }
        long reads = 0, writes = 0;
        for (var method : AnalyticsController.class.getDeclaredMethods()) {
            if (method.isAnnotationPresent(GetMapping.class)) {
                reads++;
                var auth = method.getAnnotation(PreAuthorize.class);
                check(auth != null && auth.value().equals("hasAnyRole('ADMIN', 'ANALYTICS')"), "read authorization: " + method.getName());
            }
            if (method.isAnnotationPresent(PostMapping.class)) {
                writes++;
                check(!method.isAnnotationPresent(PreAuthorize.class), "logging still authenticated by SecurityConfig");
            }
        }
        check(reads == 6 && writes == 1, "endpoint coverage");
        check(!AnalyticsController.class.isAnnotationPresent(PreAuthorize.class), "no controller-level log restriction");
        System.out.println("Passed Java date, filter, and endpoint-annotation checks (not a Spring authorization integration test).");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
