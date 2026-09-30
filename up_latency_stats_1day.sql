-- PROCEDURE: stat.up_latency_stats_1day()

-- DROP PROCEDURE IF EXISTS stat.up_latency_stats_1day();

CREATE OR REPLACE PROCEDURE stat.up_latency_stats_1day(
    )
LANGUAGE 'plpgsql'
AS $BODY$
BEGIN
    RAISE INFO '% :Started -> latency_stats_1day', now();

    INSERT INTO stat.latency_stats_1day (
        tx_date,
        protocol,
        partition,
        market,
        location,
        no_ord,
        med_latency,
        avg_latency,
        min_latency,
        max_latency,
        under_sla,
        no_ord_me_vrd_in_type_1,
        no_ord_me_vrd_in_type_2,
        no_ord_me_vrd_in_type_3,
        no_ord_me_vrd_in_type_4,
        no_ord_me_vrd_in_type_5,
        no_ord_me_vrd_in_type_6,
        no_ord_me_net_in_type_1,
        no_ord_me_net_in_type_2,
        no_ord_me_net_in_type_3,
        no_ord_me_net_in_type_4,
        no_ord_me_net_in_type_5,
        no_ord_me_net_in_type_6,
        no_ord_gw_net_in_type_1,
        no_ord_gw_net_in_type_2,
        no_ord_gw_net_in_type_3,
        no_ord_gw_net_in_type_4,
        no_ord_gw_net_in_type_5,
        no_ord_gw_net_in_type_6
    )
    SELECT
        (left(epoch(me_net_input_time), 10))::date AS tx_date,
        left(process, 2) AS protocol,
        partition,
        market,
        (CASE
            WHEN node LIKE '%FIXC%' OR node LIKE '%OUC%' THEN 'COLO'
            ELSE 'UEA'
        END) AS location,
        coalesce(count(*), 0) AS no_ord,
        coalesce(median(gw_net_latency) FILTER (WHERE gw_net_latency > 0)::int, 0) AS med_latency,
        coalesce(avg(gw_net_latency), 0) AS avg_latency,
        coalesce(min(gw_net_latency), 0) AS min_latency,
        coalesce(max(gw_net_latency), 0) AS max_latency,
        coalesce(sum(CASE WHEN gw_net_latency <= 100 THEN 1 END), 0) AS under_sla,
        count(CASE WHEN me_vrd_latency BETWEEN 1 AND 60 THEN 1 END) AS no_ord_me_vrd_in_type_1,
        count(CASE WHEN me_vrd_latency BETWEEN 61 AND 100 THEN 1 END) AS no_ord_me_vrd_in_type_2,
        count(CASE WHEN me_vrd_latency BETWEEN 101 AND 200 THEN 1 END) AS no_ord_me_vrd_in_type_3,
        count(CASE WHEN me_vrd_latency BETWEEN 201 AND 500 THEN 1 END) AS no_ord_me_vrd_in_type_4,
        count(CASE WHEN me_vrd_latency BETWEEN 501 AND 1000 THEN 1 END) AS no_ord_me_vrd_in_type_5,
        count(CASE WHEN me_vrd_latency >= 1001 THEN 1 END) AS no_ord_me_vrd_in_type_6,
        count(CASE WHEN me_net_latency BETWEEN 1 AND 60 THEN 1 END) AS no_ord_me_net_in_type_1,
        count(CASE WHEN me_net_latency BETWEEN 61 AND 100 THEN 1 END) AS no_ord_me_net_in_type_2,
        count(CASE WHEN me_net_latency BETWEEN 101 AND 200 THEN 1 END) AS no_ord_me_net_in_type_3,
        count(CASE WHEN me_net_latency BETWEEN 201 AND 500 THEN 1 END) AS no_ord_me_net_in_type_4,
        count(CASE WHEN me_net_latency BETWEEN 501 AND 1000 THEN 1 END) AS no_ord_me_net_in_type_5,
        count(CASE WHEN me_net_latency >= 1001 THEN 1 END) AS no_ord_me_net_in_type_6,
        count(CASE WHEN gw_net_latency BETWEEN 1 AND 60 THEN 1 END) AS no_ord_gw_net_in_type_1,
        count(CASE WHEN gw_net_latency BETWEEN 61 AND 100 THEN 1 END) AS no_ord_gw_net_in_type_2,
        count(CASE WHEN gw_net_latency BETWEEN 101 AND 200 THEN 1 END) AS no_ord_gw_net_in_type_3,
        count(CASE WHEN gw_net_latency BETWEEN 201 AND 500 THEN 1 END) AS no_ord_gw_net_in_type_4,
        count(CASE WHEN gw_net_latency BETWEEN 501 AND 1000 THEN 1 END) AS no_ord_gw_net_in_type_5,
        count(CASE WHEN gw_net_latency >= 1001 THEN 1 END) AS no_ord_gw_net_in_type_6
    FROM public.me_pcap
    WHERE participant NOT LIKE '%PRV%'
      AND market != ''
      AND (process LIKE 'FG_%' OR process LIKE 'DE_%')
      AND tx_date = current_date
    GROUP BY
        left(epoch(me_net_input_time), 10),
        left(process, 2),
        partition,
        market,
        location
    ON CONFLICT (tx_date, protocol, partition, market, location)
    DO UPDATE SET
        no_ord = coalesce(EXCLUDED.no_ord, 0),
        med_latency = coalesce(EXCLUDED.med_latency, 0),
        avg_latency = coalesce(EXCLUDED.avg_latency, 0),
        min_latency = coalesce(EXCLUDED.min_latency, 0),
        max_latency = coalesce(EXCLUDED.max_latency, 0),
        under_sla = coalesce(EXCLUDED.under_sla, 0),
        no_ord_me_vrd_in_type_1 = coalesce(EXCLUDED.no_ord_me_vrd_in_type_1, 0),
        no_ord_me_vrd_in_type_2 = coalesce(EXCLUDED.no_ord_me_vrd_in_type_2, 0),
        no_ord_me_vrd_in_type_3 = coalesce(EXCLUDED.no_ord_me_vrd_in_type_3, 0),
        no_ord_me_vrd_in_type_4 = coalesce(EXCLUDED.no_ord_me_vrd_in_type_4, 0),
        no_ord_me_vrd_in_type_5 = coalesce(EXCLUDED.no_ord_me_vrd_in_type_5, 0),
        no_ord_me_vrd_in_type_6 = coalesce(EXCLUDED.no_ord_me_vrd_in_type_6, 0),
        no_ord_me_net_in_type_1 = coalesce(EXCLUDED.no_ord_me_net_in_type_1, 0),
        no_ord_me_net_in_type_2 = coalesce(EXCLUDED.no_ord_me_net_in_type_2, 0),
        no_ord_me_net_in_type_3 = coalesce(EXCLUDED.no_ord_me_net_in_type_3, 0),
        no_ord_me_net_in_type_4 = coalesce(EXCLUDED.no_ord_me_net_in_type_4, 0),
        no_ord_me_net_in_type_5 = coalesce(EXCLUDED.no_ord_me_net_in_type_5, 0),
        no_ord_me_net_in_type_6 = coalesce(EXCLUDED.no_ord_me_net_in_type_6, 0),
        no_ord_gw_net_in_type_1 = coalesce(EXCLUDED.no_ord_gw_net_in_type_1, 0),
        no_ord_gw_net_in_type_2 = coalesce(EXCLUDED.no_ord_gw_net_in_type_2, 0),
        no_ord_gw_net_in_type_3 = coalesce(EXCLUDED.no_ord_gw_net_in_type_3, 0),
        no_ord_gw_net_in_type_4 = coalesce(EXCLUDED.no_ord_gw_net_in_type_4, 0),
        no_ord_gw_net_in_type_5 = coalesce(EXCLUDED.no_ord_gw_net_in_type_5, 0),
        no_ord_gw_net_in_type_6 = coalesce(EXCLUDED.no_ord_gw_net_in_type_6, 0);

    COMMIT;

    RAISE INFO '% :Completed -> latency_stats_1day', now();
END;
$BODY$;

ALTER PROCEDURE stat.up_latency_stats_1day()
    OWNER TO svcstat_test;
