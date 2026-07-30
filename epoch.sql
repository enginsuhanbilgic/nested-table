-- FUNCTION: stat.epoch(bigint)

-- DROP FUNCTION IF EXISTS stat.epoch(bigint);

CREATE OR REPLACE FUNCTION stat.epoch(
    inputtime bigint)
    RETURNS text
    LANGUAGE 'sql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$

select
    coalesce(
        to_char(
            to_timestamp(cast(left(inputtime::text, 10) as bigint)),
            'YYYY-MM-DD HH24:MI:SS'
        ),
        ''
    )
    || '.'
    || substring(inputtime::text, 11, length(inputtime::text) - 10)

$BODY$;

ALTER FUNCTION stat.epoch(bigint)
    OWNER TO svcstat_test;
