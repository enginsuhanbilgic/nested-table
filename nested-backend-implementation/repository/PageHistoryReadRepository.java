package com.bistech.reporting.repository;

import com.bistech.reporting.dto.audit.PageHistoryAnalytics.*;
import com.bistech.reporting.dto.audit.UserPageHistoryFilterRequest;
import com.bistech.reporting.dto.audit.UserPageHistoryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** PostgreSQL read queries. Every aggregate is calculated before pagination. */
@Repository
@RequiredArgsConstructor
public class PageHistoryReadRepository {
    private final NamedParameterJdbcTemplate jdbc;
    private static final String SOURCE = " FROM stat.user_page_history h JOIN stat.lr_users u ON u.id = h.user_id";

    public Summary summary(UserPageHistoryFilterRequest request) {
        var f = UserPageHistorySpecs.of(request);
        return jdbc.queryForObject("SELECT count(*) visits, count(DISTINCT h.user_id) users, "
                + "count(DISTINCT h.page_path) pages" + SOURCE + f.sql(), f.params(), (rs, i) -> {
            long visits = rs.getLong("visits"), users = rs.getLong("users");
            return new Summary(visits, users, rs.getLong("pages"), users == 0 ? 0 : (double) visits / users);
        });
    }

    public List<Activity> activity(UserPageHistoryFilterRequest request, LocalDate day) {
        var normalized = request.normalized();
        if (day != null && (day.isBefore(normalized.from()) || day.isAfter(normalized.to()))) {
            throw badRequest("Selected day must be inside the date range.");
        }
        var f = UserPageHistorySpecs.of(normalized);
        String mask = day == null ? "YYYY-MM-DD" : "HH24";
        String extra = "";
        if (day != null) {
            extra = " AND h.visit_timestamp >= :dayStart AND h.visit_timestamp < :dayEnd";
            f.params().addValue("dayStart", day.atStartOfDay(UserPageHistoryFilterRequest.ZONE).toOffsetDateTime())
                    .addValue("dayEnd", day.plusDays(1).atStartOfDay(UserPageHistoryFilterRequest.ZONE).toOffsetDateTime());
        }
        var found = jdbc.query("SELECT to_char(h.visit_timestamp AT TIME ZONE 'Europe/Istanbul', '" + mask
                        + "') bucket, count(*) visits, count(DISTINCT h.user_id) users" + SOURCE + f.sql() + extra
                        + " GROUP BY 1 ORDER BY 1", f.params(),
                (rs, i) -> new Activity(rs.getString("bucket"), rs.getLong("visits"), rs.getLong("users")));
        Map<String, Activity> byBucket = new HashMap<>();
        found.forEach(row -> byBucket.put(row.bucket(), row));
        List<Activity> result = new ArrayList<>();
        if (day == null) {
            normalized.from().datesUntil(normalized.to().plusDays(1)).forEach(date -> {
                String key = date.toString();
                result.add(byBucket.getOrDefault(key, new Activity(key, 0, 0)));
            });
        } else {
            for (int hour = 0; hour < 24; hour++) {
                String key = String.format(java.util.Locale.ROOT, "%02d", hour);
                result.add(byBucket.getOrDefault(key, new Activity(key, 0, 0)));
            }
        }
        return result;
    }

    public Page<PageItem> pages(UserPageHistoryFilterRequest request, int page, int size, String sort) {
        var f = UserPageHistorySpecs.of(request);
        String order = order(sort, Map.of("visits", "visits", "uniqueUsers", "users", "pagePath", "h.page_path", "lastVisit", "last_visit"), "h.page_path ASC");
        return paged("SELECT h.page_path, max(h.page_title) page_title, count(*) visits, "
                        + "count(DISTINCT h.user_id) users, max(h.visit_timestamp) last_visit, "
                        + "100.0 * count(*) / sum(count(*)) OVER () share" + SOURCE + f.sql() + " GROUP BY h.page_path",
                "SELECT count(DISTINCT h.page_path)" + SOURCE + f.sql(), f, page, size, order,
                (rs, i) -> new PageItem(rs.getString("page_path"), rs.getString("page_title"), rs.getLong("visits"),
                        rs.getLong("users"), rs.getDouble("share"), timestamp(rs, "last_visit")));
    }

    public Page<UserItem> users(UserPageHistoryFilterRequest request, int page, int size, String sort) {
        var f = UserPageHistorySpecs.of(request);
        String order = order(sort, Map.of("visits", "visits", "uniquePages", "pages", "username", "u.username", "lastVisit", "last_visit"), "h.user_id ASC");
        return paged("SELECT h.user_id, u.username, count(*) visits, count(DISTINCT h.page_path) pages, "
                        + "max(h.visit_timestamp) last_visit" + SOURCE + f.sql() + " GROUP BY h.user_id, u.username",
                "SELECT count(DISTINCT h.user_id)" + SOURCE + f.sql(), f, page, size, order,
                (rs, i) -> new UserItem(rs.getObject("user_id", UUID.class), rs.getString("username"),
                        rs.getLong("visits"), rs.getLong("pages"), timestamp(rs, "last_visit")));
    }

    public Page<UserPageHistoryResponse> history(UserPageHistoryFilterRequest request, int page, int size, String sort) {
        var f = UserPageHistorySpecs.of(request);
        String order = order(sort, Map.of("visitTimestamp", "h.visit_timestamp", "username", "u.username", "pagePath", "h.page_path"), "h.id DESC");
        return paged("SELECT h.*, u.username" + SOURCE + f.sql(), "SELECT count(*)" + SOURCE + f.sql(),
                f, page, size, order, (rs, i) -> new UserPageHistoryResponse(rs.getLong("id"),
                        rs.getObject("user_id", UUID.class), rs.getString("username"), rs.getString("page_path"),
                        rs.getString("page_title"), timestamp(rs, "visit_timestamp"), rs.getString("referrer"), rs.getString("user_agent")));
    }

    /** Limited, searchable choices; independent of admin APIs. Other active filters remain applied. */
    public List<Option> options(UserPageHistoryFilterRequest request, String kind, String search) {
        var f = UserPageHistorySpecs.of(request);
        f.params().addValue("search", UserPageHistorySpecs.pattern(search == null ? "" : search.trim()));
        String sql = switch (kind) {
            case "users" -> "SELECT DISTINCT CAST(h.user_id AS text) id, u.username label" + SOURCE + f.sql()
                    + " AND lower(u.username) LIKE :search ESCAPE '!' ORDER BY label, id LIMIT 50";
            case "pages" -> "SELECT DISTINCT h.page_path id, h.page_path label" + SOURCE + f.sql()
                    + " AND lower(h.page_path) LIKE :search ESCAPE '!' ORDER BY label LIMIT 50";
            case "roles" -> "SELECT DISTINCT r.code id, r.code label FROM stat.lr_roles r"
                    + " WHERE lower(r.code) LIKE :search ESCAPE '!' AND EXISTS (SELECT 1"
                    + SOURCE + " JOIN stat.lr_user_roles ur ON ur.user_id = h.user_id" + f.sql()
                    + " AND ur.role_id = r.id) ORDER BY label LIMIT 50";
            default -> throw badRequest("Unknown option kind.");
        };
        return jdbc.query(sql, f.params(), (rs, i) -> new Option(rs.getString("id"), rs.getString("label")));
    }

    private <T> Page<T> paged(String query, String countQuery, UserPageHistorySpecs.Filter filter,
                             int page, int size, String order, RowMapper<T> mapper) {
        if (page < 0 || size < 1 || size > 100) throw badRequest("Page must be nonnegative; size must be 1–100.");
        var pageable = PageRequest.of(page, size);
        long total = jdbc.queryForObject(countQuery, filter.params(), Long.class);
        filter.params().addValue("limit", size).addValue("offset", pageable.getOffset());
        var rows = jdbc.query(query + " ORDER BY " + order + " LIMIT :limit OFFSET :offset", filter.params(), mapper);
        return new PageImpl<>(rows, pageable, total);
    }

    private static String order(String sort, Map<String, String> columns, String tieBreaker) {
        String[] parts = sort.split(",", -1);
        if (parts.length != 2 || !columns.containsKey(parts[0]) ||
                !(parts[1].equalsIgnoreCase("asc") || parts[1].equalsIgnoreCase("desc"))) {
            throw badRequest("Unsupported sort. Use field,asc or field,desc.");
        }
        return columns.get(parts[0]) + " " + parts[1] + ", " + tieBreaker;
    }

    private static OffsetDateTime timestamp(ResultSet rs, String column) throws SQLException {
        var value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant().atZone(UserPageHistoryFilterRequest.ZONE).toOffsetDateTime();
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
