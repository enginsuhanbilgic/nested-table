package com.bistech.reporting.repository;

import com.bistech.reporting.dto.audit.UserPageHistoryFilterRequest;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import java.util.Locale;

/** Parameterized read predicates shared by history and all aggregates.
 * The outer query must name user_page_history h. No collection joins: one row = one visit.
 */
public final class UserPageHistorySpecs {
    private UserPageHistorySpecs() { }
    public record Filter(String sql, MapSqlParameterSource params) { }

    public static Filter of(UserPageHistoryFilterRequest request) {
        var f = request.normalized();
        var params = new MapSqlParameterSource()
                .addValue("from", f.from().atStartOfDay(UserPageHistoryFilterRequest.ZONE).toOffsetDateTime())
                .addValue("until", f.to().plusDays(1).atStartOfDay(UserPageHistoryFilterRequest.ZONE).toOffsetDateTime());
        var sql = new StringBuilder(" WHERE h.visit_timestamp >= :from AND h.visit_timestamp < :until");
        if (f.userId() != null) {
            sql.append(" AND h.user_id = :userId");
            params.addValue("userId", f.userId());
        }
        if (!f.roleCodeIn().isEmpty()) {
            sql.append("""
                     AND EXISTS (SELECT 1 FROM stat.lr_user_roles ur
                         JOIN stat.lr_roles r ON r.id = ur.role_id
                         WHERE ur.user_id = h.user_id AND upper(r.code) IN (:roles))
                    """);
            params.addValue("roles", f.roleCodeIn());
        }
        if (f.pagePathExact() != null) {
            sql.append(" AND h.page_path = :exactPath");
            params.addValue("exactPath", f.pagePathExact());
        }
        contains(sql, params, "h.page_path", "path", f.pagePath());
        contains(sql, params, "h.page_title", "title", f.pageTitle());
        contains(sql, params, "h.referrer", "referrer", f.referrer());
        contains(sql, params, "h.user_agent", "agent", f.userAgent());
        return new Filter(sql.toString(), params);
    }

    public static String pattern(String value) {
        return "%" + value.toLowerCase(Locale.ROOT).replace("!", "!!")
                .replace("%", "!%").replace("_", "!_") + "%";
    }

    private static void contains(StringBuilder sql, MapSqlParameterSource params,
                                 String column, String name, String value) {
        if (value != null) {
            sql.append(" AND lower(").append(column).append(") LIKE :").append(name).append(" ESCAPE '!'");
            params.addValue(name, pattern(value));
        }
    }
}
