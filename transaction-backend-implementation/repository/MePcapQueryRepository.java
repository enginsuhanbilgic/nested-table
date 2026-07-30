package com.bistech.reporting.repository.transaction;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;

/**
 * Raw JDBC access to public.me_pcap / his.me_pcap. Plain SQL instead of JPA
 * on purpose: me_pcap has no primary key, lives in two schemas that are
 * chosen per query, and the neighbor queries need UNION ALL + per-side LIMIT
 * shapes Criteria cannot express. The schema name is taken from the
 * {@link Schema} enum only -- never from user input.
 */
@Repository
@RequiredArgsConstructor
public class MePcapQueryRepository {

    /** Whitelisted physical locations of me_pcap. */
    public enum Schema {
        PUBLIC("public.me_pcap"),
        HIS("his.me_pcap");

        private final String table;

        Schema(final String table) {
            this.table = table;
        }

        public String table() {
            return table;
        }
    }

    /**
     * gw_net_input_time precedes me_net_input_time by the gateway->ME path
     * time (microseconds in practice). Widening the me_net_input_time index
     * range by this slack lets GW-windowed queries run off the existing
     * (tx_date, me_net_input_time) indexes with an exact gw filter on top,
     * so no gw_net_input_time index is needed on the hot table.
     */
    private static final long GW_TO_ME_SLACK_NS = 1_000_000_000L;

    private static final String COLS = """
            p.commit_id, p.order_id, p.tx_date, p.client_id, p.app_id,
            p.app_seq, p.status, p.node, p.partition, p.process, p.side,
            p.series, p.user_name, p.participant, p.market, p.account_id,
            p.input_message_type, p.connector_port,
            p.me_vrd_input_time, p.me_vrd_output_time,
            p.me_net_input_time, p.me_net_output_time,
            p.gw_net_input_time, p.gw_net_output_time,
            p.me_asic_input_time, p.me_asic_output_time,
            p.me_vrd_latency, p.me_net_latency, p.gw_net_latency,
            p.me_asic_latency""";

    private static final String NOT_PRV =
            "(p.participant IS NULL OR p.participant NOT LIKE '%PRV%')";

    private static final RowMapper<MePcapRow> ROW_MAPPER =
            MePcapQueryRepository::mapRow;

    private final JdbcTemplate jdbcTemplate;

    /**
     * Does this commit exist in this schema for this date? One index probe;
     * used to route neighbor queries to wherever the day's data currently
     * lives (public until the nightly ~04:15 migration, his afterwards).
     */
    public boolean commitExists(
            final Schema schema,
            final LocalDate txDate,
            final long commitId
    ) {
        String sql = "SELECT EXISTS (SELECT 1 FROM " + schema.table() + " p"
                + " WHERE p.tx_date = ? AND p.commit_id = ?)";

        return Boolean.TRUE.equals(
                jdbcTemplate.queryForObject(sql, Boolean.class, txDate, commitId));
    }

    /** The searched order's lineage: every row sharing the order_id. */
    public List<MePcapRow> findByOrderId(
            final Schema schema,
            final long orderId,
            final LocalDate txDate
    ) {
        String sql = "SELECT " + COLS
                + " FROM " + schema.table() + " p"
                + " WHERE p.order_id = ? AND p.tx_date = ?"
                + " ORDER BY p.commit_id";

        return jdbcTemplate.query(sql, ROW_MAPPER, orderId, txDate);
    }

    /**
     * All dates on which the order_id exists (both schemas; the caller drops
     * the already-searched date). One order_id index probe per his partition
     * plus one on public -- cheap even at hundreds of millions of rows.
     */
    public List<LocalDate> findDatesContainingOrder(final long orderId) {
        String sql = """
                SELECT DISTINCT tx_date FROM his.me_pcap WHERE order_id = ?
                UNION
                SELECT DISTINCT tx_date FROM public.me_pcap WHERE order_id = ?
                ORDER BY 1""";

        return jdbcTemplate.queryForList(sql, LocalDate.class, orderId, orderId);
    }

    /**
     * Nearest neighbors in the SAME ME PARTITION, windowed on
     * me_net_input_time: up to limitPerSide rows strictly before the
     * reference time and up to limitPerSide at-or-after it (reference row
     * itself excluded). Ordered by me_net_input_time.
     */
    public List<MePcapRow> findMeNeighbors(
            final Schema schema,
            final LocalDate txDate,
            final short partition,
            final long refMeInputNs,
            final long refCommitId,
            final long windowNs,
            final int limitPerSide
    ) {
        String base = " FROM " + schema.table() + " p"
                + " WHERE p.tx_date = ? AND p.partition = ? AND " + NOT_PRV;

        String sql = "SELECT * FROM ("
                + "(SELECT " + COLS + base
                + "   AND p.me_net_input_time >= ? AND p.me_net_input_time < ?"
                + "   ORDER BY p.me_net_input_time DESC LIMIT ?)"
                + " UNION ALL "
                + "(SELECT " + COLS + base
                + "   AND p.me_net_input_time >= ? AND p.me_net_input_time <= ?"
                + "   AND p.commit_id <> ?"
                + "   ORDER BY p.me_net_input_time ASC LIMIT ?)"
                + ") t ORDER BY t.me_net_input_time, t.commit_id";

        return jdbcTemplate.query(
                sql,
                ROW_MAPPER,
                txDate, partition,
                refMeInputNs - windowNs, refMeInputNs, limitPerSide,
                txDate, partition,
                refMeInputNs, refMeInputNs + windowNs, refCommitId, limitPerSide
        );
    }

    /**
     * Nearest neighbors on the SAME GATEWAY THREAD (node + process +
     * partition), windowed on gw_net_input_time but scanned via the widened
     * me_net_input_time range (see GW_TO_ME_SLACK_NS). Rows that never
     * reached the ME have me_net_input_time NULL and are excluded by the
     * range predicate itself -- exactly the agreed behavior.
     */
    public List<MePcapRow> findGwNeighbors(
            final Schema schema,
            final LocalDate txDate,
            final String node,
            final String process,
            final short partition,
            final long refGwInputNs,
            final long refCommitId,
            final long windowNs,
            final int limitPerSide
    ) {
        String base = " FROM " + schema.table() + " p"
                + " WHERE p.tx_date = ?"
                + "   AND p.node = ? AND p.process = ? AND p.partition = ?"
                + "   AND p.me_net_input_time >= ? AND p.me_net_input_time <= ?"
                + "   AND " + NOT_PRV;

        long meLo = refGwInputNs - windowNs;
        long meHi = refGwInputNs + windowNs + GW_TO_ME_SLACK_NS;

        String sql = "SELECT * FROM ("
                + "(SELECT " + COLS + base
                + "   AND p.gw_net_input_time >= ? AND p.gw_net_input_time < ?"
                + "   ORDER BY p.gw_net_input_time DESC LIMIT ?)"
                + " UNION ALL "
                + "(SELECT " + COLS + base
                + "   AND p.gw_net_input_time >= ? AND p.gw_net_input_time <= ?"
                + "   AND p.commit_id <> ?"
                + "   ORDER BY p.gw_net_input_time ASC LIMIT ?)"
                + ") t ORDER BY t.gw_net_input_time, t.commit_id";

        return jdbcTemplate.query(
                sql,
                ROW_MAPPER,
                txDate, node, process, partition, meLo, meHi,
                refGwInputNs - windowNs, refGwInputNs, limitPerSide,
                txDate, node, process, partition, meLo, meHi,
                refGwInputNs, refGwInputNs + windowNs, refCommitId, limitPerSide
        );
    }

    private static MePcapRow mapRow(final ResultSet rs, final int rowNum)
            throws SQLException {
        return new MePcapRow(
                rs.getObject("commit_id", Long.class),
                rs.getObject("order_id", Long.class),
                rs.getObject("tx_date", LocalDate.class),
                rs.getString("client_id"),
                rs.getString("app_id"),
                rs.getObject("app_seq", Long.class),
                rs.getObject("status", Integer.class),
                rs.getString("node"),
                rs.getObject("partition", Short.class),
                rs.getString("process"),
                rs.getObject("side", Short.class),
                rs.getString("series"),
                rs.getString("user_name"),
                rs.getString("participant"),
                rs.getString("market"),
                rs.getString("account_id"),
                rs.getString("input_message_type"),
                rs.getObject("connector_port", Integer.class),
                rs.getObject("me_vrd_input_time", Long.class),
                rs.getObject("me_vrd_output_time", Long.class),
                rs.getObject("me_net_input_time", Long.class),
                rs.getObject("me_net_output_time", Long.class),
                rs.getObject("gw_net_input_time", Long.class),
                rs.getObject("gw_net_output_time", Long.class),
                rs.getObject("me_asic_input_time", Long.class),
                rs.getObject("me_asic_output_time", Long.class),
                rs.getObject("me_vrd_latency", Long.class),
                rs.getObject("me_net_latency", Long.class),
                rs.getObject("gw_net_latency", Long.class),
                rs.getObject("me_asic_latency", Long.class)
        );
    }
}
