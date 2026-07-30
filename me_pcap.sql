-- Table: public.me_pcap

-- DROP TABLE IF EXISTS public.me_pcap;

CREATE TABLE IF NOT EXISTS public.me_pcap
(
    commit_id bigint NOT NULL,
    order_id bigint,
    client_id character varying(100) COLLATE pg_catalog."default",
    tx_date date,
    app_id character varying(4) COLLATE pg_catalog."default",
    app_seq bigint,
    status integer,
    node character varying(20) COLLATE pg_catalog."default",
    partition smallint,
    process character varying(20) COLLATE pg_catalog."default",
    me_vrd_input_time bigint,
    me_vrd_output_time bigint,
    me_net_input_time bigint,
    me_net_output_time bigint,
    gw_net_input_time bigint,
    gw_net_output_time bigint,
    me_vrd_latency bigint,
    me_net_latency bigint,
    gw_net_latency bigint,
    side smallint,
    series character varying(50) COLLATE pg_catalog."default",
    user_name character varying(40) COLLATE pg_catalog."default",
    participant character varying(20) COLLATE pg_catalog."default",
    market character varying(1) COLLATE pg_catalog."default",
    input_message_type character varying(50) COLLATE pg_catalog."default",
    connector_port integer,
    client_id_hex character varying(100) COLLATE pg_catalog."default",
    me_asic_input_time bigint,
    me_asic_output_time bigint,
    me_asic_latency bigint,
    account_id character varying(20) COLLATE pg_catalog."default"
)

WITH (
    autovacuum_enabled = TRUE
)
