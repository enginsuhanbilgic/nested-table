-- Table: stat.daily_latency_stat_demo

-- DROP TABLE IF EXISTS stat.daily_latency_stat_demo;

CREATE TABLE IF NOT EXISTS stat.daily_latency_stat_demo
(
    tx_date date,
    protocol character varying(10) COLLATE pg_catalog."default",
    partition smallint,
    market character varying(1) COLLATE pg_catalog."default",
    location character varying(10) COLLATE pg_catalog."default",
    no_ord integer,
    med integer,
    avg integer,
    max integer,
    min integer,
    from_time timestamp without time zone,
    under_sla integer,
    id bigint NOT NULL DEFAULT nextval('stat.daily_latency_stat_demo_id_tmp_seq'::regclass)
)