import com.bistech.reporting.dto.audit.UserPageHistoryFilterRequest;
import com.bistech.reporting.repository.PageHistoryReadRepository;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.web.server.ResponseStatusException;
import java.sql.DriverManager;
import java.time.LocalDate;
import java.util.List;

/** Opt-in PostgreSQL integration checks, using an EMPTY dedicated test database.
 * CREATE SCHEMA intentionally fails if stat already exists. All fixture DDL/data is rolled back.
 */
public class PageHistoryDatabaseCheck {
    public static void main(String[] args) throws Exception {
        String url = System.getenv("PAGE_HISTORY_TEST_JDBC_URL");
        if (url == null) throw new IllegalStateException("Set PAGE_HISTORY_TEST_JDBC_URL to an empty test database.");
        try (var connection = DriverManager.getConnection(url,
                System.getenv("PAGE_HISTORY_TEST_USER"), System.getenv("PAGE_HISTORY_TEST_PASSWORD"))) {
            connection.setAutoCommit(false);
            try {
                try (var statement = connection.createStatement()) {
                    statement.execute("CREATE SCHEMA stat");
                    statement.execute("CREATE TABLE stat.lr_users (id uuid PRIMARY KEY, username text)");
                    statement.execute("CREATE TABLE stat.lr_roles (id integer PRIMARY KEY, code text)");
                    statement.execute("CREATE TABLE stat.lr_user_roles (user_id uuid, role_id integer)");
                    statement.execute("""
                        CREATE TABLE stat.user_page_history (id bigint PRIMARY KEY, user_id uuid,
                            page_path text, page_title text, visit_timestamp timestamptz,
                            referrer text, user_agent text)
                        """);
                    statement.execute("""
                        INSERT INTO stat.lr_users VALUES
                          ('00000000-0000-0000-0000-000000000001', 'alice'),
                          ('00000000-0000-0000-0000-000000000002', 'bob')
                        """);
                    statement.execute("INSERT INTO stat.lr_roles VALUES (1, 'ANALYTICS'), (2, 'ADMIN')");
                    statement.execute("""
                        INSERT INTO stat.lr_user_roles VALUES
                          ('00000000-0000-0000-0000-000000000001', 1),
                          ('00000000-0000-0000-0000-000000000001', 1),
                          ('00000000-0000-0000-0000-000000000001', 2)
                        """);
                    statement.execute("""
                        INSERT INTO stat.user_page_history VALUES
                          (1, '00000000-0000-0000-0000-000000000001', '/a', 'A', '2026-09-22 20:59:59+00', '', null),
                          (2, '00000000-0000-0000-0000-000000000001', '/a', 'A', '2026-09-22 21:00:00+00', '', null),
                          (3, '00000000-0000-0000-0000-000000000002', '/b', 'B', '2026-09-23 12:00:00+00', '/a', 'Browser'),
                          (4, '00000000-0000-0000-0000-000000000001', '/a', 'A', '2026-09-23 20:59:59.999999+00', '/b', 'Browser'),
                          (5, '00000000-0000-0000-0000-000000000001', '/a', 'A', '2026-09-23 21:00:00+00', '', null)
                        """);
                }
                var repository = new PageHistoryReadRepository(new NamedParameterJdbcTemplate(new SingleConnectionDataSource(connection, true)));
                var day = LocalDate.parse("2026-09-23");
                var filter = new UserPageHistoryFilterRequest(null, null, null, null, null, null, null, day, day);
                var summary = repository.summary(filter);
                check(summary.visits() == 3 && summary.uniqueUsers() == 2 && summary.uniquePages() == 2, "date boundaries and summary");
                check(summary.visitsPerUser() == 1.5, "visits per user");
                var roles = new UserPageHistoryFilterRequest(null, List.of("ANALYTICS", "ADMIN"), null, null, null, null, null, day, day);
                check(repository.summary(roles).visits() == 2, "multiple roles/sources do not multiply visits");
                var pages = repository.pages(filter, 0, 1, "visits,desc");
                check(pages.getTotalElements() == 2 && pages.getContent().getFirst().pagePath().equals("/a"), "aggregate pagination");
                check(Math.abs(pages.getContent().getFirst().sharePercent() - 200.0 / 3) < 0.001, "share before pagination");
                check(repository.pages(filter, 1, 1, "visits,desc").getContent().getFirst().pagePath().equals("/b"), "second page");
                check(repository.users(filter, 0, 25, "visits,desc").getTotalElements() == 2, "user aggregates");
                check(repository.history(filter, 0, 25, "visitTimestamp,desc").getContent().getFirst().id() == 4, "newest first");
                var hours = repository.activity(filter, day);
                check(hours.size() == 24 && hours.getFirst().visits() == 1 && hours.get(1).visits() == 0 && hours.getLast().visits() == 1, "hourly zero fill and timezone");
                check(repository.activity(filter, null).getFirst().uniqueUsers() == 2, "daily distinct users");
                check(repository.options(filter, "users", "ali").size() == 1, "searchable users");
                check(repository.options(filter, "roles", "").size() == 2, "role options");
                check(repository.options(filter, "pages", "").size() == 2, "page options");
                var literal = new UserPageHistoryFilterRequest(null, null, "/a%", null, null, null, null, day, day);
                check(repository.summary(literal).visits() == 0, "LIKE wildcard treated literally");
                try {
                    repository.history(filter, 0, 25, "visitTimestamp;drop table x,desc");
                    throw new AssertionError("unsafe sort accepted");
                } catch (ResponseStatusException expected) { check(expected.getStatusCode().value() == 400, "sort validation"); }
                System.out.println("Passed PostgreSQL page-history integration checks.");
            } finally {
                connection.rollback();
            }
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
