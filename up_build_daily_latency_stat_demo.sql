-- PROCEDURE: stat.up_build_daily_latency_stat_demo()

-- DROP PROCEDURE IF EXISTS stat.up_build_daily_latency_stat_demo();

CREATE OR REPLACE PROCEDURE stat.up_build_daily_latency_stat_demo(
    )
LANGUAGE 'plpgsql'
AS $BODY$
BEGIN
    RAISE INFO '% :Started -> up_build_daily_latency_stat_demo', now();

    insert into stat.daily_latency_stat_stddev(
        tx_date,
        protocol,
        partition,
        market,
        location,
        avg,
        std,
        lower_bound_val,
        upper_bound_val
    )
    select
        tx_date,
        left(process, 2) as protocol,
        partition,
        market,
        (case when node like '%FIXC%' or node like '%OUC%' THEN 'COLO' ELSE 'UEA' END) as location,
        avg(gw_net_latency)::int avg,
        stddev(gw_net_latency)::int std,
        20 as lower_bound_val,
        (AVG(gw_net_latency) + stddev(gw_net_latency) * 2)::int as upper_bound_val
    from public.me_pcap as p
    where Participant not like '%PRV%'
      and input_message_type not in ('M096', 'M075')
      and tx_date = current_date
      and (process like 'FG_%' or process like 'DE_%')
    group by tx_date, left(process, 2), partition, market, location
    on CONFLICT (tx_date, protocol, partition, market, location)
        do update set avg = EXCLUDED.avg,
                      std = EXCLUDED.std,
                      lower_bound_val = EXCLUDED.lower_bound_val,
                      upper_bound_val = EXCLUDED.upper_bound_val;

    commit;

    insert into stat.daily_latency_stat_demo(
        tx_date,
        protocol,
        partition,
        market,
        location,
        from_time,
        no_ord,
        under_sla,
        avg,
        max,
        min,
        med
    )
    SELECT
        pcap1.tx_date,
        left(pcap1.process, 2) as protocol,
        pcap1.partition,
        pcap1.market,
        (case when node like '%FIXC%' or node like '%OUC%' THEN 'COLO' ELSE 'UEA' END) AS location,
        (left(epoch(gw_net_input_time), 16) || ':00')::timestamp as from_time,
        count(*) as no_ord,
        coalesce(sum(case when gw_net_latency <= 100 then 1 end), 0) as under_sla,
        (AVG(pcap1.gw_net_latency))::int as avg,
        max(gw_net_latency) as max,
        min(gw_net_latency) as min,
        percentile_disc(0.5) within group (order by pcap1.gw_net_latency)::int as med
    FROM public.me_pcap pcap1
    where Participant not like '%PRV%'
      and input_message_type not in ('M096', 'M075')
      and gw_net_latency is not null
      and tx_date = current_date
      and (process like 'FG_%' or process like 'DE_%')
      and pcap1.gw_net_latency >
          (select pcap2.lower_bound_val
           from stat.daily_latency_stat_stddev pcap2
           where pcap2.tx_date = pcap1.tx_date
             and left(pcap1.process, 2) = pcap2.protocol
             and pcap1.partition = pcap2.partition
             and pcap1.market = pcap2.market
             and (case when pcap1.node like '%FIXC%' or pcap1.node like '%OUC%' THEN 'COLO' ELSE 'UEA' END) = pcap2.location
          )
      and gw_net_latency <
          (select pcap2.upper_bound_val
           from stat.daily_latency_stat_stddev pcap2
           where pcap2.tx_date = pcap1.tx_date
             and left(pcap1.process, 2) = pcap2.protocol
             and pcap1.partition = pcap2.partition
             and pcap1.market = pcap2.market
             and (case when pcap1.node like '%FIXC%' or pcap1.node like '%OUC%' THEN 'COLO' ELSE 'UEA' END) = pcap2.location
          )
    group by
        pcap1.tx_date,
        left(pcap1.process, 2),
        pcap1.partition,
        pcap1.market,
        (case when pcap1.node like '%FIXC%' or pcap1.node like '%OUC%' THEN 'COLO' ELSE 'UEA' END),
        left(epoch(gw_net_input_time), 16)
    on CONFLICT (tx_date, protocol, partition, market, location, from_time)
        do update set no_ord = EXCLUDED.no_ord,
                      med = EXCLUDED.med,
                      avg = EXCLUDED.avg,
                      max = EXCLUDED.max,
                      min = EXCLUDED.min;

    insert into stat.daily_latency_user_stat_demo(
        tx_date,
        user_name,
        participant,
        protocol,
        node,
        partition,
        market,
        location,
        from_time,
        no_ord,
        under_sla,
        avg,
        max,
        min,
        med
    )
    SELECT
        pcap1.tx_date,
        pcap1.user_name as user_name,
        pcap1.participant as participant,
        left(pcap1.process, 2) as protocol,
        pcap1.node as node,
        pcap1.partition,
        pcap1.market,
        (case when node like '%FIXC%' or node like '%OUC%' THEN 'COLO' ELSE 'UEA' END) AS location,
        (left(epoch(gw_net_input_time), 16) || ':00')::timestamp as from_time,
        count(*) as no_ord,
        coalesce(sum(case when gw_net_latency <= 100 then 1 end), 0) as under_sla,
        (AVG(pcap1.gw_net_latency))::int as avg,
        max(gw_net_latency) as max,
        min(gw_net_latency) as min,
        percentile_disc(0.5) within group (order by pcap1.gw_net_latency)::int as med
    FROM public.me_pcap pcap1
    where Participant not like '%PRV%'
      and input_message_type not in ('M096', 'M075')
      and gw_net_latency is not null
      and tx_date = current_date
      and (process like 'FG_%' or process like 'DE_%')
      and pcap1.gw_net_latency >
          (select pcap2.lower_bound_val
           from stat.daily_latency_stat_stddev pcap2
           where pcap2.tx_date = pcap1.tx_date
             and left(pcap1.process, 2) = pcap2.protocol
             and pcap1.partition = pcap2.partition
             and pcap1.market = pcap2.market
             and (case when pcap1.node like '%FIXC%' or pcap1.node like '%OUC%' THEN 'COLO' ELSE 'UEA' END) = pcap2.location
          )
      and gw_net_latency <
          (select pcap2.upper_bound_val
           from stat.daily_latency_stat_stddev pcap2
           where pcap2.tx_date = pcap1.tx_date
             and left(pcap1.process, 2) = pcap2.protocol
             and pcap1.partition = pcap2.partition
             and pcap1.market = pcap2.market
             and (case when pcap1.node like '%FIXC%' or pcap1.node like '%OUC%' THEN 'COLO' ELSE 'UEA' END) = pcap2.location
          )
    group by
        pcap1.tx_date,
        pcap1.user_name,
        pcap1.participant,
        left(pcap1.process, 2),
        pcap1.node,
        pcap1.partition,
        pcap1.market,
        (case when pcap1.node like '%FIXC%' or pcap1.node like '%OUC%' THEN 'COLO' ELSE 'UEA' END),
        left(epoch(gw_net_input_time), 16)
    on CONFLICT (tx_date, user_name, participant, protocol, node, partition, market, location, from_time)
        do update set no_ord = EXCLUDED.no_ord,
                      med = EXCLUDED.med,
                      avg = EXCLUDED.avg,
                      max = EXCLUDED.max,
                      min = EXCLUDED.min;

    commit;
    RAISE INFO '% :Completed -> up_build_daily_latency_stat_demo', now();
END;
$BODY$;

ALTER PROCEDURE stat.up_build_daily_latency_stat_demo()
    OWNER TO svcstat_test;
