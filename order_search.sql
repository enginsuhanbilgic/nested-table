-- ============================================================================
-- TRANSACTION (ORDER SEARCH) PAGE -- stat schema objects
-- ============================================================================
-- Backs the order-search / transaction page:
--   * stat.order_search      -- one row per queued search; doubles as the work
--                               queue (workers claim QUEUED rows with
--                               FOR UPDATE SKIP LOCKED) and as the per-user
--                               history grid + shared cache.
--   * stat.order_search_hit  -- snapshot of the me_pcap rows matched by
--                               order_id (the searched order's lineage:
--                               original + cancels/modifications).
--
-- Neighbor ("orders near this one") data is NOT persisted -- it is computed
-- live per button click from public/his.me_pcap. No new indexes on me_pcap
-- are required for that:
--   * ME scope filters (tx_date, me_net_input_time range, partition) and is
--     served by idx_me_pcap_txdate_netin / idx_his_me_pcap_txdate_netin
--     (created by latency_stats_pipeline.sql).
--   * GW scope has no gw_net_input_time index; instead the query scans the
--     SAME me_net_input_time index with the window widened by a 1 s slack
--     (gw_net_input_time always precedes me_net_input_time by far less) and
--     applies the exact gw_net_input_time range as a filter. Rows that never
--     reached the ME (me_net_input_time IS NULL) are excluded from neighbor
--     lists by design, so the trick loses nothing.
--     UNITS: gw_net_* times are MICROSECONDS since epoch while me_net_* /
--     me_vrd_* times are NANOSECONDS -- the backend scales the gw window
--     x1000 before applying it to the me index range.
--
-- DEPLOYMENT ORDER: run AFTER latency_stats_pipeline.sql -- section 3 below
-- REDEFINES stat.up_purge_latency_stats with a fourth parameter.
--
-- gen_random_uuid() is built in on PostgreSQL 13+. On older versions run
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- ============================================================================


-- ============================================================================
-- 1. SEARCH QUEUE / HISTORY / CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS stat.order_search (
    id           bigserial   PRIMARY KEY,
    -- Opaque id used in shareable URLs (/transactions/{public_id}); the
    -- sequential PK stays internal so links cannot be enumerated.
    public_id    uuid        NOT NULL DEFAULT gen_random_uuid(),
    order_id     bigint      NOT NULL,
    tx_date      date        NOT NULL,
    status       text        NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED','RUNNING','DONE','NOT_FOUND','FAILED')),
    -- Filled on NOT_FOUND: other tx_dates (his and/or public) that DO contain
    -- this order_id, so the UI can offer "search that date instead".
    hint_dates   date[],
    -- lr_users id of whoever's request triggered THIS execution (ops
    -- attribution only). Per-user history lives in order_search_request --
    -- with shared cache hits, several users' searches map to one execution.
    -- Never serialized into any response DTO.
    requested_by uuid        NOT NULL,
    attempts     smallint    NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    started_at   timestamptz,
    finished_at  timestamptz,
    error_text   text,
    result_count integer
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_search_public_id
    ON stat.order_search (public_id);

-- At most ONE in-flight search per (order_id, tx_date): a concurrent
-- identical request loses the insert race and is handed the winner's row.
-- Finished searches may repeat (today's results are re-run after the 15 min
-- reuse TTL), hence partial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_search_active
    ON stat.order_search (order_id, tx_date)
    WHERE status IN ('QUEUED','RUNNING');

-- Reuse/TTL lookup: latest search for an (order_id, tx_date).
CREATE INDEX IF NOT EXISTS idx_order_search_order_date
    ON stat.order_search (order_id, tx_date, created_at DESC);

-- Worker claim scan (FIFO by id) + stale-RUNNING reaper.
CREATE INDEX IF NOT EXISTS idx_order_search_active_scan
    ON stat.order_search (id)
    WHERE status IN ('QUEUED','RUNNING');

-- (No index on order_search.requested_by: the history grid reads from
-- order_search_request below, which carries its own index.)

-- Who searched what. order_search is the executed job (shared between
-- users via the cache); this table is each user's search history. Every
-- EXPLICIT search upserts a row here -- re-searching the same order bumps
-- created_at, and two users searching the same order each get their own row
-- no matter who won the execution. Opening a shared results link writes
-- nothing, so link views never appear in anyone's history.
CREATE TABLE IF NOT EXISTS stat.order_search_request (
    search_id    bigint NOT NULL
        REFERENCES stat.order_search (id) ON DELETE CASCADE,
    requested_by uuid        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (search_id, requested_by)
);

-- Per-user history grid.
CREATE INDEX IF NOT EXISTS idx_order_search_request_user
    ON stat.order_search_request (requested_by, created_at DESC);

-- Backfill for deployments that predate order_search_request (idempotent;
-- no-op on fresh installs).
INSERT INTO stat.order_search_request (search_id, requested_by, created_at)
SELECT id, requested_by, created_at
  FROM stat.order_search
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 2. MATCHED-ORDER SNAPSHOTS
--    Column set/types mirror me_pcap (client_id_hex and the unused me_asic_*
--    columns intentionally omitted). commit_id is confirmed globally unique,
--    but tx_date is kept: neighbor queries need it for schema routing
--    (public vs his) and his partition pruning.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stat.order_search_hit (
    search_id           bigint NOT NULL
        REFERENCES stat.order_search (id) ON DELETE CASCADE,
    commit_id           bigint NOT NULL,
    order_id            bigint,
    tx_date             date,
    client_id           varchar(100),
    app_id              varchar(4),
    app_seq             bigint,
    status              integer,
    node                varchar(20),
    partition           smallint,
    process             varchar(20),
    side                smallint,
    series              varchar(50),
    user_name           varchar(40),
    participant         varchar(20),
    market              varchar(1),
    account_id          varchar(20),
    input_message_type  varchar(50),
    connector_port      integer,
    me_vrd_input_time   bigint,
    me_vrd_output_time  bigint,
    me_net_input_time   bigint,
    me_net_output_time  bigint,
    gw_net_input_time   bigint,
    gw_net_output_time  bigint,
    me_vrd_latency      bigint,
    me_net_latency      bigint,
    gw_net_latency      bigint,
    PRIMARY KEY (search_id, commit_id)
);

-- In-place migration for deployments created before the asic columns were
-- dropped from the feature (no-ops on fresh installs).
ALTER TABLE stat.order_search_hit
    DROP COLUMN IF EXISTS me_asic_input_time,
    DROP COLUMN IF EXISTS me_asic_output_time,
    DROP COLUMN IF EXISTS me_asic_latency;


-- ============================================================================
-- 3. RETENTION
--    Redefines the pipeline's purge procedure so the same nightly
--    CALL stat.up_purge_latency_stats() also removes searches: DONE rows
--    after 14 days, and NOT_FOUND/FAILED rows after just a few hours --
--    those are invisible to users (never cached, never listed), so junk
--    searches must not linger. Hits/requests follow via ON DELETE CASCADE.
--    Supersedes the 3-parameter version in latency_stats_pipeline.sql
--    section 5 (and the earlier 4-parameter revision of this file).
-- ============================================================================

DROP PROCEDURE IF EXISTS stat.up_purge_latency_stats(int, int, int);
DROP PROCEDURE IF EXISTS stat.up_purge_latency_stats(int, int, int, int);

CREATE OR REPLACE PROCEDURE stat.up_purge_latency_stats(
    p_keep_days_minute         int DEFAULT 8,
    p_keep_days_daily          int DEFAULT 370,
    p_keep_days_minute_general int DEFAULT 40,
    p_keep_days_order_search   int DEFAULT 14,
    p_keep_hours_dead_search   int DEFAULT 6)
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
    DELETE FROM stat.order_search
     WHERE status IN ('NOT_FOUND', 'FAILED')
       AND created_at < now() - make_interval(hours => p_keep_hours_dead_search);
    DELETE FROM stat.order_search
     WHERE created_at < now() - make_interval(days => p_keep_days_order_search);
    RAISE INFO '% : purge done.', now();
END;
$proc$;
