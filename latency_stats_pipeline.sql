-- ============================================================================
-- LATENCY STATISTICS PIPELINE (stat schema)
-- ============================================================================
-- Replaces stat.get_user_stat_gw / stat.up_build_user_stat, and (via the
-- 'general' grain) stat.up_latency_stats_1day (-> stat.latency_stats_1day)
-- and stat.up_build_daily_latency_stat_demo (-> stat.daily_latency_stat_demo).
--
-- DESIGN SUMMARY
--   * Grain "user" is the finest level; node / instance(node+process) /
--     participant / user / series stats are computed in ONE scan per pass
--     using GROUPING SETS (percentiles do not roll up, so every level is
--     computed from raw rows).
--   * A sixth grain 'general' (protocol x partition x market x location,
--     where protocol = left(process,2) and location = COLO/UEA from node)
--     replaces the old latency_stats_1day / daily_latency_stat_demo tables.
--     It is just one more grouping set in the same two passes, so general
--     rows carry the full me_* AND gw_* stat set like every other grain.
--   * Minute-by-minute stats are maintained incrementally:
--       - per-partition watermarks on commit_id (commit_id is increasing
--         per partition, NOT globally),
--       - every run finds delta rows (commit_id > watermark), derives the
--         set of TOUCHED MINUTE BUCKETS, and recomputes those buckets
--         entirely from me_pcap. Late/partial minutes are therefore fixed
--         automatically on the next run -- no scheduling assumptions about
--         the loader are needed.
--   * Daily stats are fully recomputed each run (exact percentiles).
--     Additive metrics would roll up from minutes, but p50/p99 cannot, and
--     your measured throughput (~15M rows / 10s) makes exact recompute
--     acceptable at 100M rows on a 30-minute cadence.
--
-- ASSUMPTIONS / NOTES
--   1. me_net_input_time etc. are NANOSECONDS since epoch; latency columns
--      are MICROSECONDS. No unit conversion is done on latencies.
--   2. Minute buckets are derived from me_net_input_time, interpreted in the
--      SERVER TimeZone (same assumption the old public.epoch() code made).
--      This also applies to the 'general' grain -- the old demo proc
--      bucketed by gw_net_input_time; the difference only moves rows that
--      straddle a minute boundary by the gw->me path time (microseconds).
--   3. Row filters (change here if business rules change):
--        participant not null/empty, participant NOT LIKE '%PRV%',
--        input_message_type NOT IN ('MO96','MO75','ET96')  (NULL type kept),
--        process LIKE '%DE\_%' OR '%FG\_%'  (underscore ESCAPED -- the old
--        code's unescaped '_' was a wildcard and over-matched).
--   4. BEHAVIOUR CHANGES vs old function (expect count/value shifts):
--        - me_net_latency is no longer divided by 1000 (bug fix),
--        - no 20..900000 clipping of gw latency; negative latencies are
--          excluded from latency aggregates only,
--        - rows are no longer required to have me_net_latency IS NOT NULL:
--          no_ord counts all business-valid orders; each latency aggregate
--          simply ignores NULLs,
--        - ET96 added to excluded message types,
--        - grouping is by real entity keys, never by port,
--        - FIX/OUC delete rules removed (per your answer #5).
--   5. BEHAVIOUR CHANGES vs old 1day/demo procs (the 'general' grain):
--        - message-type exclusion actually works now (the old procs matched
--          'M096'/'M075' with a ZERO; the real types are MO96/MO75) and
--          NULL-typed rows are kept instead of silently dropped,
--        - no +-2*stddev band, no lower bound 20: negative latencies are
--          excluded from latency aggregates only; the stddev table is dead,
--        - under_sla counts ALL valid orders with 0 <= gw <= 100 (the old
--          band excluded the fastest orders from an "under SLA" metric),
--        - empty/NULL market is kept and grouped as '' (latency_stats_1day
--          dropped those rows, the demo proc kept them -- they disagreed),
--        - tx_date is the me_pcap column, never re-derived from a timestamp
--          (the old NULL-date keys duplicated rows on every run),
--        - latency columns are NULL (not 0) when nothing was measurable.
--   6. under_sla (all grains, both passes) = orders with gw_net_latency
--      between 0 and 100 microseconds. Hardcoded threshold.
--   7. Volatile ("peak") windows remain hardcoded: 09:39:50-09:41:00 and
--      09:59:50-10:01:00 (time-of-day of me_net_input_time).
--   8. Series stats are DAILY ONLY (cardinality too high for minute grain).
--   9. "partition" is only meaningful at the 'general' grain (it is a real
--      grouping dimension there). Every other grain stores -1 -- an instance
--      is NOT tied to a single partition, so no per-instance partition is
--      recorded (the old "instance -> exactly 1 partition" note was wrong).
--
-- DEPLOYMENT ORDER
--   1) indexes (use CREATE INDEX CONCURRENTLY in production!),
--   2) tables + in-place migration (section 2 is idempotent; on an already
--      deployed schema it adds the general-grain columns and rebuilds the
--      two unique indexes),
--   3) function+procedures, 4) views,
--   5) backfill history:  CALL stat.up_refresh_latency_stats(DATE 'yyyy-mm-dd');
--      for each of the last 7 days (reads his.me_pcap),
--   6) schedule stat.up_refresh_latency_stats() every 30 min 06:00-22:30 and
--      one run shortly after the nightly public->his move for the closed day:
--      CALL stat.up_refresh_latency_stats(current_date - 1);
--      plus a daily CALL stat.up_purge_latency_stats();
--   7) unschedule the old 1day/demo jobs and (once verified) run the drops
--      in section 8.
-- ============================================================================


-- ============================================================================
-- 1. INDEXES ON me_pcap (table itself untouched; loader unaffected)
--    In production run these as CREATE INDEX CONCURRENTLY (outside a tx).
-- ============================================================================

-- Delta detection: per-partition watermark scans and max(commit_id) lookups.
-- INCLUDE makes the delta scan index-only (bucket derivation + tx_date check).
CREATE INDEX IF NOT EXISTS idx_me_pcap_part_commit
    ON public.me_pcap (partition, commit_id)
    INCLUDE (me_net_input_time, tx_date);

-- Minute-bucket recompute: each touched minute is a contiguous range of
-- me_net_input_time. Non-partial on purpose (filters may change).
CREATE INDEX IF NOT EXISTS idx_me_pcap_txdate_netin
    ON public.me_pcap (tx_date, me_net_input_time);

CREATE INDEX IF NOT EXISTS idx_his_me_pcap_txdate_netin
    ON his.me_pcap (tx_date, me_net_input_time);

-- NOTE: consider auditing existing ind_commit_id / indx_order_id /
-- indx_client_user for removal -- every index taxes ~100M daily inserts.
-- idx_me_pcap_part_commit largely supersedes ind_commit_id.


-- ============================================================================
-- 2. TABLES (idempotent: CREATE for fresh installs, ALTERs migrate a live
--    schema in place; the unique indexes are rebuilt to include the new
--    general-grain key columns)
-- ============================================================================

-- Per-(day,partition) high-water mark of processed commit_ids.
CREATE TABLE IF NOT EXISTS stat.latency_load_watermark (
    tx_date        date     NOT NULL,
    partition      smallint NOT NULL,
    last_commit_id bigint   NOT NULL,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tx_date, partition)
);

-- Minute-grain stats for node / instance / participant / user / general.
-- Key columns not applicable to a grp_type are '' (partition: -1), which
-- keeps the unique index simple and upsert-friendly on any PG version.
CREATE TABLE IF NOT EXISTS stat.latency_minute_stat (
    tx_date     date        NOT NULL,
    bucket_ts   timestamptz NOT NULL,               -- minute start
    grp_type    text        NOT NULL,               -- node|instance|participant|user|general
    node        text        NOT NULL DEFAULT '',
    process     text        NOT NULL DEFAULT '',
    participant text        NOT NULL DEFAULT '',
    user_name   text        NOT NULL DEFAULT '',
    protocol    text        NOT NULL DEFAULT '',    -- general rows: left(process,2)
    partition   smallint    NOT NULL DEFAULT -1,    -- general rows
    market      text        NOT NULL DEFAULT '',    -- general rows
    location    text        NOT NULL DEFAULT '',    -- general rows: COLO|UEA
    no_ord      bigint,
    under_sla   bigint,                             -- 0 <= gw latency <= 100
    me_avg numeric(14,1), me_p50 numeric(14,1), me_p99 numeric(14,1),
    me_min bigint,        me_max bigint,
    gw_avg numeric(14,1), gw_p50 numeric(14,1), gw_p99 numeric(14,1),
    gw_min bigint,        gw_max bigint,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- In-place migration of a pre-general deployment (no-ops on fresh installs).
ALTER TABLE stat.latency_minute_stat
    ADD COLUMN IF NOT EXISTS protocol  text     NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS partition smallint NOT NULL DEFAULT -1,
    ADD COLUMN IF NOT EXISTS market    text     NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS location  text     NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS under_sla bigint;

-- Serves both the upsert and per-entity chart lookups (prefix access).
-- Rebuilt (not IF NOT EXISTS) so the general key columns join the index.
DROP INDEX IF EXISTS stat.uq_latency_minute_stat;
CREATE UNIQUE INDEX uq_latency_minute_stat
    ON stat.latency_minute_stat
       (tx_date, grp_type, node, process, participant, user_name,
        protocol, partition, market, location, bucket_ts);

-- Daily stats for node / instance / participant / user / series / general.
CREATE TABLE IF NOT EXISTS stat.latency_daily_stat (
    tx_date     date NOT NULL,
    grp_type    text NOT NULL,        -- node|instance|participant|user|series|general
    node        text NOT NULL DEFAULT '',
    process     text NOT NULL DEFAULT '',
    participant text NOT NULL DEFAULT '',
    user_name   text NOT NULL DEFAULT '',
    series      text NOT NULL DEFAULT '',
    protocol    text NOT NULL DEFAULT '',   -- general rows: left(process,2)
    market      text NOT NULL DEFAULT '',   -- general rows
    location    text NOT NULL DEFAULT '',   -- general rows: COLO|UEA
    -- descriptive attributes (filled only where meaningful)
    participant_name text,      -- user rows
    gateway_node     text,      -- user rows
    node_instance    text,      -- user rows
    partition        integer NOT NULL DEFAULT -1,
                                -- KEY for general rows; -1 for every other
                                -- grain (only meaningful at general grain)
    ports            integer[], -- user rows (usually 1 element, sometimes more)
    num_instances    integer,   -- node rows
    num_users        integer,   -- node/instance/participant/series/general rows
    -- measures
    no_ord             bigint,
    no_ord_in_volatile bigint,
    under_sla          bigint,  -- 0 <= gw latency <= 100
    me_avg numeric(14,1), me_p50 numeric(14,1), me_p99 numeric(14,1),
    me_min bigint,        me_max bigint,
    gw_avg numeric(14,1), gw_p50 numeric(14,1), gw_p99 numeric(14,1),
    gw_min bigint,        gw_max bigint,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- In-place migration (no-ops on fresh installs). partition becomes part of
-- the upsert key, so it must lose its NULLs first.
ALTER TABLE stat.latency_daily_stat
    ADD COLUMN IF NOT EXISTS protocol  text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS market    text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS location  text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS under_sla bigint;

-- partition joins the upsert key: NULLs must go, and legacy per-instance
-- partition values must be normalised to -1 (otherwise the first refresh
-- would not match those rows and would insert duplicates next to them).
UPDATE stat.latency_daily_stat
   SET partition = -1
 WHERE partition IS NULL
    OR (grp_type <> 'general' AND partition <> -1);
ALTER TABLE stat.latency_daily_stat
    ALTER COLUMN partition SET DEFAULT -1,
    ALTER COLUMN partition SET NOT NULL;

DROP INDEX IF EXISTS stat.uq_latency_daily_stat;
CREATE UNIQUE INDEX uq_latency_daily_stat
    ON stat.latency_daily_stat
       (tx_date, grp_type, node, process, participant, user_name, series,
        protocol, partition, market, location);


-- ============================================================================
-- 3. HELPER
-- ============================================================================

-- Nanoseconds-since-epoch -> timestamptz (second precision; enough for
-- minute bucketing and the peak windows). Integer division on purpose:
-- ns values (~1.7e18) exceed double precision's exact range, so never
-- divide as float before truncating.
CREATE OR REPLACE FUNCTION stat.ns_to_ts(p_ns bigint)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT to_timestamp((p_ns / 1000000000)::double precision) $$;


-- ============================================================================
-- 4. MAIN REFRESH PROCEDURE
--    p_tx_date = current_date  -> incremental (watermarks) over public.me_pcap
--    p_tx_date < current_date  -> full rebuild of that day over his.me_pcap
-- ============================================================================

CREATE OR REPLACE PROCEDURE stat.up_refresh_latency_stats(
    p_tx_date date DEFAULT current_date)
LANGUAGE plpgsql
AS $proc$
DECLARE
    c_row_filter CONSTANT text := $flt$
            p.participant IS NOT NULL
        AND btrim(p.participant) <> ''
        AND p.participant NOT LIKE '%PRV%'
        AND coalesce(p.input_message_type, '') NOT IN ('MO96', 'MO75', 'ET96')
        AND (p.process LIKE '%DE\_%' OR p.process LIKE '%FG\_%')
    $flt$;

    -- Location rule of the old 1day/demo procs, unchanged.
    c_loc_expr CONSTANT text := $loc$
        CASE WHEN p.node LIKE '%FIXC%' OR p.node LIKE '%OUC%'
             THEN 'COLO' ELSE 'UEA' END
    $loc$;

    v_is_today   boolean := (p_tx_date = current_date);
    v_src        text;
    v_locked     boolean;
    v_partitions smallint[];
    v_part       smallint;
    v_old_wm     bigint;
    v_new_wm     bigint;
    v_n_buckets  bigint;
    v_min_ns     bigint;
    v_max_ns     bigint;
    v_sql        text;
BEGIN
    v_src := CASE WHEN v_is_today THEN 'public.me_pcap' ELSE 'his.me_pcap' END;

    -- Never let two refreshes overlap.
    SELECT pg_try_advisory_xact_lock(hashtext('stat.up_refresh_latency_stats'))
      INTO v_locked;
    IF NOT v_locked THEN
        RAISE INFO '% : another refresh is running, skipping.', now();
        RETURN;
    END IF;

    RAISE INFO '% : refresh started for % (source %)', now(), p_tx_date, v_src;

    -- Uncomment / tune if grouping-sets sorts spill to disk on the daily pass:
    -- EXECUTE 'SET LOCAL work_mem = ''512MB''';

    DROP TABLE IF EXISTS tmp_touched_minutes;
    CREATE TEMP TABLE tmp_touched_minutes (
        bucket_ts timestamptz PRIMARY KEY,
        ns_lo     bigint NOT NULL,
        ns_hi     bigint NOT NULL
    );

    DROP TABLE IF EXISTS tmp_new_watermarks;
    CREATE TEMP TABLE tmp_new_watermarks (
        partition smallint PRIMARY KEY,
        new_id    bigint NOT NULL
    );

    -- ------------------------------------------------------------------
    -- A. Determine which minute buckets need (re)computation
    -- ------------------------------------------------------------------
    IF v_is_today THEN
        -- Distinct partitions via recursive skip-scan on (partition, commit_id);
        -- robust if the partition set changes in the future.
        v_sql := format($f$
            WITH RECURSIVE r(p) AS (
                SELECT min(partition) FROM %1$s
                UNION ALL
                SELECT (SELECT min(s.partition) FROM %1$s s WHERE s.partition > r.p)
                  FROM r WHERE r.p IS NOT NULL
            )
            SELECT coalesce(array_agg(p), '{}') FROM r WHERE p IS NOT NULL
        $f$, v_src);
        EXECUTE v_sql INTO v_partitions;

        FOREACH v_part IN ARRAY v_partitions LOOP
            EXECUTE format('SELECT max(commit_id) FROM %s WHERE partition = $1', v_src)
               INTO v_new_wm USING v_part;

            SELECT coalesce(
                     (SELECT last_commit_id
                        FROM stat.latency_load_watermark
                       WHERE tx_date = p_tx_date AND partition = v_part), 0)
              INTO v_old_wm;

            CONTINUE WHEN v_new_wm IS NULL OR v_new_wm <= v_old_wm;

            -- Delta rows flag every minute bucket they belong to. Buckets are
            -- then recomputed IN FULL below, which also repairs buckets that
            -- were only partially loaded on the previous run.
            EXECUTE format($f$
                INSERT INTO tmp_touched_minutes (bucket_ts, ns_lo, ns_hi)
                SELECT d.b,
                       extract(epoch FROM d.b)::bigint * 1000000000,
                       extract(epoch FROM d.b)::bigint * 1000000000 + 60000000000
                  FROM (SELECT DISTINCT
                               date_trunc('minute', stat.ns_to_ts(p.me_net_input_time)) AS b
                          FROM %s p
                         WHERE p.partition = $1
                           AND p.commit_id > $2
                           AND p.commit_id <= $3
                           AND p.tx_date   = $4
                           AND p.me_net_input_time IS NOT NULL) d
                ON CONFLICT (bucket_ts) DO NOTHING
            $f$, v_src)
            USING v_part, v_old_wm, v_new_wm, p_tx_date;

            INSERT INTO tmp_new_watermarks VALUES (v_part, v_new_wm);
        END LOOP;

        SELECT count(*) INTO v_n_buckets FROM tmp_touched_minutes;
        IF v_n_buckets = 0 THEN
            RAISE INFO '% : no new data, nothing to do.', now();
            RETURN;
        END IF;
    ELSE
        -- Historical rebuild: enumerate every possible minute of that day
        -- (min/max lookups are instant via idx_..._txdate_netin; empty
        -- buckets simply produce no rows in the lateral scan).
        EXECUTE format(
            'SELECT min(me_net_input_time), max(me_net_input_time)
               FROM %s WHERE tx_date = $1', v_src)
           INTO v_min_ns, v_max_ns USING p_tx_date;

        IF v_min_ns IS NULL THEN
            RAISE INFO '% : no rows for % in %, nothing to do.', now(), p_tx_date, v_src;
            RETURN;
        END IF;

        INSERT INTO tmp_touched_minutes (bucket_ts, ns_lo, ns_hi)
        SELECT g,
               extract(epoch FROM g)::bigint * 1000000000,
               extract(epoch FROM g)::bigint * 1000000000 + 60000000000
          FROM generate_series(date_trunc('minute', stat.ns_to_ts(v_min_ns)),
                               date_trunc('minute', stat.ns_to_ts(v_max_ns)),
                               interval '1 minute') g;

        SELECT count(*) INTO v_n_buckets FROM tmp_touched_minutes;
    END IF;

    RAISE INFO '% : recomputing % minute bucket(s).', now(), v_n_buckets;

    -- ------------------------------------------------------------------
    -- B. Recompute touched minute buckets for all 5 groups in one pass.
    --    grouping(node, process, participant, user_name):
    --      7 = node, 3 = instance, 13 = participant, 14 = user,
    --      15 = general (all four grouped away; keyed by the extra columns)
    -- ------------------------------------------------------------------
    v_sql := format($f$
        INSERT INTO stat.latency_minute_stat AS tgt
              (tx_date, bucket_ts, grp_type,
               node, process, participant, user_name,
               protocol, partition, market, location,
               no_ord, under_sla,
               me_avg, me_p50, me_p99, me_min, me_max,
               gw_avg, gw_p50, gw_p99, gw_min, gw_max)
        SELECT $1,
               t.bucket_ts,
               CASE grouping(m.node, m.process, m.participant, m.user_name)
                    WHEN 7  THEN 'node'
                    WHEN 3  THEN 'instance'
                    WHEN 13 THEN 'participant'
                    WHEN 14 THEN 'user'
                    WHEN 15 THEN 'general'
               END,
               coalesce(m.node, ''), coalesce(m.process, ''),
               coalesce(m.participant, ''), coalesce(m.user_name, ''),
               coalesce(m.protocol, ''), coalesce(m.part, -1),
               coalesce(m.market, ''), coalesce(m.location, ''),
               count(*),
               count(*) FILTER (WHERE m.gw_lat <= 100),
               round(avg(m.me_lat)::numeric, 1),
               round((percentile_cont(0.5 ) WITHIN GROUP (ORDER BY m.me_lat::double precision))::numeric, 1),
               round((percentile_cont(0.99) WITHIN GROUP (ORDER BY m.me_lat::double precision))::numeric, 1),
               min(m.me_lat), max(m.me_lat),
               round(avg(m.gw_lat)::numeric, 1),
               round((percentile_cont(0.5 ) WITHIN GROUP (ORDER BY m.gw_lat::double precision))::numeric, 1),
               round((percentile_cont(0.99) WITHIN GROUP (ORDER BY m.gw_lat::double precision))::numeric, 1),
               min(m.gw_lat), max(m.gw_lat)
          FROM tmp_touched_minutes t
         CROSS JOIN LATERAL (
               SELECT p.node, p.process, p.participant, p.user_name,
                      left(p.process, 2)        AS protocol,
                      coalesce(p.partition, -1) AS part,
                      coalesce(p.market, '')    AS market,
                      %3$s                      AS location,
                      CASE WHEN p.me_net_latency >= 0 THEN p.me_net_latency END AS me_lat,
                      CASE WHEN p.gw_net_latency >= 0 THEN p.gw_net_latency END AS gw_lat
                 FROM %1$s p
                WHERE p.tx_date = $1
                  AND p.me_net_input_time >= t.ns_lo
                  AND p.me_net_input_time <  t.ns_hi
                  AND %2$s
               ) m
         GROUP BY GROUPING SETS ((t.bucket_ts, m.node),
                                 (t.bucket_ts, m.node, m.process),
                                 (t.bucket_ts, m.participant),
                                 (t.bucket_ts, m.user_name),
                                 (t.bucket_ts, m.protocol, m.part, m.market, m.location))
        ON CONFLICT (tx_date, grp_type, node, process, participant, user_name,
                     protocol, partition, market, location, bucket_ts)
        DO UPDATE SET
               no_ord    = EXCLUDED.no_ord,
               under_sla = EXCLUDED.under_sla,
               me_avg = EXCLUDED.me_avg, me_p50 = EXCLUDED.me_p50,
               me_p99 = EXCLUDED.me_p99, me_min = EXCLUDED.me_min,
               me_max = EXCLUDED.me_max,
               gw_avg = EXCLUDED.gw_avg, gw_p50 = EXCLUDED.gw_p50,
               gw_p99 = EXCLUDED.gw_p99, gw_min = EXCLUDED.gw_min,
               gw_max = EXCLUDED.gw_max,
               updated_at = now()
    $f$, v_src, c_row_filter, c_loc_expr);
    EXECUTE v_sql USING p_tx_date;

    RAISE INFO '% : minute stats done, starting daily pass.', now();

    -- ------------------------------------------------------------------
    -- C. Recompute daily stats (all 6 groups, exact percentiles) in one pass.
    --    grouping(node, process, participant, user_name, series):
    --      15 = node, 7 = instance, 27 = participant, 29 = user,
    --      30 = series, 31 = general
    -- ------------------------------------------------------------------
    v_sql := format($f$
        INSERT INTO stat.latency_daily_stat AS tgt
              (tx_date, grp_type,
               node, process, participant, user_name, series,
               protocol, market, location,
               participant_name, gateway_node, node_instance,
               partition, ports, num_instances, num_users,
               no_ord, no_ord_in_volatile, under_sla,
               me_avg, me_p50, me_p99, me_min, me_max,
               gw_avg, gw_p50, gw_p99, gw_min, gw_max)
        SELECT $1,
               CASE grouping(s.node, s.process, s.participant, s.user_name, s.series)
                    WHEN 15 THEN 'node'
                    WHEN 7  THEN 'instance'
                    WHEN 27 THEN 'participant'
                    WHEN 29 THEN 'user'
                    WHEN 30 THEN 'series'
                    WHEN 31 THEN 'general'
               END,
               coalesce(s.node, ''), coalesce(s.process, ''),
               coalesce(s.participant, ''), coalesce(s.user_name, ''),
               coalesce(s.series, ''),
               coalesce(s.protocol, ''), coalesce(s.market, ''),
               coalesce(s.location, ''),
               CASE WHEN grouping(s.node, s.process, s.participant, s.user_name, s.series) = 29
                    THEN max(s.participant) END,
               CASE WHEN grouping(s.node, s.process, s.participant, s.user_name, s.series) = 29
                    THEN max(s.node) END,
               CASE WHEN grouping(s.node, s.process, s.participant, s.user_name, s.series) = 29
                    THEN max(s.process) END,
               -- s.part is a grouping column only in the general set; in all
               -- other sets it is grouped away (NULL) -> -1
               coalesce(s.part, -1)::int,
               CASE WHEN grouping(s.node, s.process, s.participant, s.user_name, s.series) = 29
                    THEN array_agg(DISTINCT s.connector_port)
                         FILTER (WHERE s.connector_port IS NOT NULL) END,
               CASE WHEN grouping(s.node, s.process, s.participant, s.user_name, s.series) = 15
                    THEN count(DISTINCT s.process)::int END,
               CASE WHEN grouping(s.node, s.process, s.participant, s.user_name, s.series) = 29
                    THEN 1 ELSE count(DISTINCT s.user_name)::int END,
               count(*),
               count(*) FILTER (WHERE s.is_vol),
               count(*) FILTER (WHERE s.gw_lat <= 100),
               round(avg(s.me_lat)::numeric, 1),
               round((percentile_cont(0.5 ) WITHIN GROUP (ORDER BY s.me_lat::double precision))::numeric, 1),
               round((percentile_cont(0.99) WITHIN GROUP (ORDER BY s.me_lat::double precision))::numeric, 1),
               min(s.me_lat), max(s.me_lat),
               round(avg(s.gw_lat)::numeric, 1),
               round((percentile_cont(0.5 ) WITHIN GROUP (ORDER BY s.gw_lat::double precision))::numeric, 1),
               round((percentile_cont(0.99) WITHIN GROUP (ORDER BY s.gw_lat::double precision))::numeric, 1),
               min(s.gw_lat), max(s.gw_lat)
          FROM (
               SELECT p.node, p.process, p.participant, p.user_name, p.series,
                      left(p.process, 2)        AS protocol,
                      coalesce(p.partition, -1) AS part,
                      coalesce(p.market, '')    AS market,
                      %3$s                      AS location,
                      p.connector_port,
                      CASE WHEN p.me_net_latency >= 0 THEN p.me_net_latency END AS me_lat,
                      CASE WHEN p.gw_net_latency >= 0 THEN p.gw_net_latency END AS gw_lat,
                      (p.me_net_input_time IS NOT NULL AND
                       (stat.ns_to_ts(p.me_net_input_time)::time
                            BETWEEN TIME '09:39:50' AND TIME '09:41:00'
                        OR stat.ns_to_ts(p.me_net_input_time)::time
                            BETWEEN TIME '09:59:50' AND TIME '10:01:00')) AS is_vol
                 FROM %1$s p
                WHERE p.tx_date = $1
                  AND %2$s
               ) s
         GROUP BY GROUPING SETS ((s.node),
                                 (s.node, s.process),
                                 (s.participant),
                                 (s.user_name),
                                 (s.series),
                                 (s.protocol, s.part, s.market, s.location))
        ON CONFLICT (tx_date, grp_type, node, process, participant, user_name, series,
                     protocol, partition, market, location)
        DO UPDATE SET
               participant_name = EXCLUDED.participant_name,
               gateway_node     = EXCLUDED.gateway_node,
               node_instance    = EXCLUDED.node_instance,
               ports            = EXCLUDED.ports,
               num_instances    = EXCLUDED.num_instances,
               num_users        = EXCLUDED.num_users,
               no_ord             = EXCLUDED.no_ord,
               no_ord_in_volatile = EXCLUDED.no_ord_in_volatile,
               under_sla          = EXCLUDED.under_sla,
               me_avg = EXCLUDED.me_avg, me_p50 = EXCLUDED.me_p50,
               me_p99 = EXCLUDED.me_p99, me_min = EXCLUDED.me_min,
               me_max = EXCLUDED.me_max,
               gw_avg = EXCLUDED.gw_avg, gw_p50 = EXCLUDED.gw_p50,
               gw_p99 = EXCLUDED.gw_p99, gw_min = EXCLUDED.gw_min,
               gw_max = EXCLUDED.gw_max,
               updated_at = now()
    $f$, v_src, c_row_filter, c_loc_expr);
    EXECUTE v_sql USING p_tx_date;

    -- ------------------------------------------------------------------
    -- D. Advance watermarks (same transaction: a failure above rolls these
    --    back too, so no data is ever skipped).
    -- ------------------------------------------------------------------
    IF v_is_today THEN
        INSERT INTO stat.latency_load_watermark (tx_date, partition, last_commit_id)
        SELECT p_tx_date, w.partition, w.new_id
          FROM tmp_new_watermarks w
        ON CONFLICT (tx_date, partition)
        DO UPDATE SET last_commit_id = EXCLUDED.last_commit_id,
                      updated_at     = now();
    END IF;

    RAISE INFO '% : refresh finished for %.', now(), p_tx_date;
END;
$proc$;


-- ============================================================================
-- 5. RETENTION
--    Minute grain is the big one (~users x active-minutes rows per day);
--    default mirrors his.me_pcap's one-week horizon. 'general' minute rows
--    are tiny (a handful of groups per minute) so they get their own,
--    longer horizon. Daily rows are tiny, kept ~1 year for trending.
-- ============================================================================

-- The signature changed (third parameter): drop the old overload first so
-- CALL stat.up_purge_latency_stats() stays unambiguous.
-- NOTE: order_search.sql (transaction page) redefines this procedure again
-- with a fourth parameter (p_keep_days_order_search); deploy that file after
-- this one -- its version is the authoritative one.
DROP PROCEDURE IF EXISTS stat.up_purge_latency_stats(int, int);

CREATE OR REPLACE PROCEDURE stat.up_purge_latency_stats(
    p_keep_days_minute         int DEFAULT 8,
    p_keep_days_daily          int DEFAULT 370,
    p_keep_days_minute_general int DEFAULT 40)
LANGUAGE plpgsql
AS $proc$
BEGIN
    DELETE FROM stat.latency_minute_stat
     WHERE (grp_type <> 'general'
            AND tx_date < current_date - p_keep_days_minute)
        OR (grp_type = 'general'
            AND tx_date < current_date - p_keep_days_minute_general);
    DELETE FROM stat.latency_load_watermark
     WHERE tx_date < current_date - p_keep_days_minute;
    DELETE FROM stat.latency_daily_stat
     WHERE tx_date < current_date - p_keep_days_daily;
    RAISE INFO '% : purge done.', now();
END;
$proc$;


-- ============================================================================
-- 6. FRONTEND VIEWS
--    Daily grids (p50 exposed as *_med to match the spec; p99/min,
--    peak_ratio and under_sla included as extras the frontend may adopt).
--    NOTE: under_sla is appended LAST in the pre-existing views on purpose:
--    CREATE OR REPLACE VIEW can only add columns at the end.
-- ============================================================================

CREATE OR REPLACE VIEW stat.v_gateway_daily AS
SELECT tx_date,
       node AS name,
       num_instances, num_users,
       no_ord AS num_orders,
       no_ord_in_volatile AS num_orders_in_peak_times,
       round(100.0 * no_ord_in_volatile / nullif(no_ord, 0), 2) AS peak_ratio,
       me_p50 AS me_med, me_avg, me_max, me_p99, me_min,
       gw_p50 AS gw_med, gw_avg, gw_max, gw_p99, gw_min,
       under_sla
  FROM stat.latency_daily_stat
 WHERE grp_type = 'node';

CREATE OR REPLACE VIEW stat.v_instance_daily AS
SELECT tx_date,
       process AS name,
       node AS gateway_name,
       nullif(partition, -1) AS partition,   -- always NULL now: partition is
                                             -- not meaningful per instance
       num_users,
       no_ord AS num_orders,
       no_ord_in_volatile AS num_orders_in_peak_times,
       round(100.0 * no_ord_in_volatile / nullif(no_ord, 0), 2) AS peak_ratio,
       me_p50 AS me_med, me_avg, me_max, me_p99, me_min,
       gw_p50 AS gw_med, gw_avg, gw_max, gw_p99, gw_min,
       under_sla
  FROM stat.latency_daily_stat
 WHERE grp_type = 'instance';

CREATE OR REPLACE VIEW stat.v_participant_daily AS
SELECT tx_date,
       participant AS name,
       num_users,
       no_ord AS num_orders,
       no_ord_in_volatile AS num_orders_in_peak_times,
       round(100.0 * no_ord_in_volatile / nullif(no_ord, 0), 2) AS peak_ratio,
       me_p50 AS me_med, me_avg, me_max, me_p99, me_min,
       gw_p50 AS gw_med, gw_avg, gw_max, gw_p99, gw_min,
       under_sla
  FROM stat.latency_daily_stat
 WHERE grp_type = 'participant';

CREATE OR REPLACE VIEW stat.v_user_daily AS
SELECT tx_date,
       user_name AS name,
       participant_name,
       gateway_node AS gw_node,
       node_instance,
       ports,                                   -- int[]; usually one element
       no_ord AS num_orders,
       no_ord_in_volatile AS num_orders_in_peak_times,
       round(100.0 * no_ord_in_volatile / nullif(no_ord, 0), 2) AS peak_ratio,
       me_p50 AS me_med, me_avg, me_max, me_p99, me_min,
       gw_p50 AS gw_med, gw_avg, gw_max, gw_p99, gw_min,
       under_sla
  FROM stat.latency_daily_stat
 WHERE grp_type = 'user';

CREATE OR REPLACE VIEW stat.v_series_daily AS
SELECT tx_date,
       series AS name,
       num_users,
       no_ord AS num_orders,
       no_ord_in_volatile AS num_orders_in_peak_times,
       me_p50 AS me_med, me_avg, me_max, me_p99, me_min,
       gw_p50 AS gw_med, gw_avg, gw_max, gw_p99, gw_min,
       under_sla
  FROM stat.latency_daily_stat
 WHERE grp_type = 'series';

-- Successor of stat.latency_stats_1day: same measure names (gw-based, as
-- before), plus the me_* side and p99s that the old table never had.
CREATE OR REPLACE VIEW stat.v_general_daily AS
SELECT tx_date,
       protocol, partition, market, location,
       num_users,
       no_ord,
       no_ord_in_volatile,
       under_sla,
       gw_p50 AS med_latency,
       gw_avg AS avg_latency,
       gw_min AS min_latency,
       gw_max AS max_latency,
       gw_p99 AS p99_latency,
       me_p50 AS me_med, me_avg, me_max, me_p99, me_min
  FROM stat.latency_daily_stat
 WHERE grp_type = 'general';

-- Minute-by-minute "Latency Series" per entity (hour/minute per the spec;
-- filter by name (+ gateway_name for instances) and tx_date in the backend).

CREATE OR REPLACE VIEW stat.v_gateway_minute AS
SELECT tx_date, node AS name,
       extract(hour   FROM bucket_ts)::int AS hour,
       extract(minute FROM bucket_ts)::int AS minute,
       me_p50 AS me_med, me_avg, me_max,
       gw_p50 AS gw_med, gw_avg, gw_max,
       me_p99, gw_p99, no_ord,
       under_sla
  FROM stat.latency_minute_stat
 WHERE grp_type = 'node';

CREATE OR REPLACE VIEW stat.v_instance_minute AS
SELECT tx_date, process AS name, node AS gateway_name,
       extract(hour   FROM bucket_ts)::int AS hour,
       extract(minute FROM bucket_ts)::int AS minute,
       me_p50 AS me_med, me_avg, me_max,
       gw_p50 AS gw_med, gw_avg, gw_max,
       me_p99, gw_p99, no_ord,
       under_sla
  FROM stat.latency_minute_stat
 WHERE grp_type = 'instance';

CREATE OR REPLACE VIEW stat.v_participant_minute AS
SELECT tx_date, participant AS name,
       extract(hour   FROM bucket_ts)::int AS hour,
       extract(minute FROM bucket_ts)::int AS minute,
       me_p50 AS me_med, me_avg, me_max,
       gw_p50 AS gw_med, gw_avg, gw_max,
       me_p99, gw_p99, no_ord,
       under_sla
  FROM stat.latency_minute_stat
 WHERE grp_type = 'participant';

CREATE OR REPLACE VIEW stat.v_user_minute AS
SELECT tx_date, user_name AS name,
       extract(hour   FROM bucket_ts)::int AS hour,
       extract(minute FROM bucket_ts)::int AS minute,
       me_p50 AS me_med, me_avg, me_max,
       gw_p50 AS gw_med, gw_avg, gw_max,
       me_p99, gw_p99, no_ord,
       under_sla
  FROM stat.latency_minute_stat
 WHERE grp_type = 'user';

-- Successor of stat.daily_latency_stat_demo (from_time -> bucket_ts):
-- same gw-based measure names as the old table, plus the me_* side.
CREATE OR REPLACE VIEW stat.v_general_minute AS
SELECT tx_date, bucket_ts,
       protocol, partition, market, location,
       no_ord,
       under_sla,
       gw_avg AS avg,
       gw_max AS max,
       gw_min AS min,
       gw_p50 AS med,
       gw_p99,
       me_p50 AS me_med, me_avg, me_max, me_min, me_p99
  FROM stat.latency_minute_stat
 WHERE grp_type = 'general';


-- ============================================================================
-- 7. SCHEDULING EXAMPLES (pg_cron; adapt to your scheduler)
--    The old up_latency_stats_1day / up_build_daily_latency_stat_demo jobs
--    must be UNSCHEDULED: this pipeline replaces them.
-- ============================================================================
-- SELECT cron.schedule('latency-refresh', '*/30 6-22 * * *',
--        $$CALL stat.up_refresh_latency_stats()$$);
-- -- After the nightly public->his move (adjust the hour to your job):
-- SELECT cron.schedule('latency-closeday', '30 23 * * *',
--        $$CALL stat.up_refresh_latency_stats(current_date - 1)$$);
-- SELECT cron.schedule('latency-purge', '0 5 * * *',
--        $$CALL stat.up_purge_latency_stats()$$);


-- ============================================================================
-- 8. DECOMMISSIONING THE OLD GENERAL-STAT OBJECTS
--    Run only after the 'general' rows are verified (and the old jobs are
--    unscheduled). Expect deliberate diffs vs the old tables: higher no_ord
--    (no stddev band, message-type typo fixed, NULL types/markets kept),
--    untrimmed latencies, and NULL instead of 0 when nothing was measured.
-- ============================================================================
-- DROP PROCEDURE IF EXISTS stat.up_latency_stats_1day();
-- DROP PROCEDURE IF EXISTS stat.up_build_daily_latency_stat_demo();
-- DROP TABLE IF EXISTS stat.latency_stats_1day;
-- DROP TABLE IF EXISTS stat.daily_latency_stat_demo;
-- DROP TABLE IF EXISTS stat.daily_latency_stat_stddev;
-- DROP TABLE IF EXISTS stat.daily_latency_user_stat_demo;
