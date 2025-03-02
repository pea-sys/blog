---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'PostgreSQLの便利クエリの動作確認③'
pubDate: 2024-09-09
description: 'PostgreSQL'
tags: ["PostgreSQL"]
---
この記事は前回の続きです。

https://master--pea-sys-blog.netlify.app/posts/20240908/

* show_server_version_num.sql

PostgreSQLバージョンの数値表現を取得します
```sql
dvdrental=# SHOW server_version_num;
 server_version_num
--------------------
 160002
(1 行)
```

* table_bloat.sql

テーブルの肥大化を検出します
```sql
dvdrental=# -- Credit: https://github.com/ioguix/pgsql-bloat-estimation/tree/master/table
dvdrental=# -- minor tweaks to exclude pg tables
dvdrental=# /* WARNING: executed with a non-superuser role, the query inspect only tables and materialized view (9.3+) you are granted to read.
dvdrental*# * This query is compatible with PostgreSQL 9.0 and more
dvdrental*# */
dvdrental-# SELECT current_database(), schemaname, tblname, bs*tblpages AS real_size,
dvdrental-#   (tblpages-est_tblpages)*bs AS extra_size,
dvdrental-#   CASE WHEN tblpages - est_tblpages > 0
dvdrental-#     THEN 100 * (tblpages - est_tblpages)/tblpages::float
dvdrental-#     ELSE 0
dvdrental-#   END AS extra_pct, fillfactor,
dvdrental-#   CASE WHEN tblpages - est_tblpages_ff > 0
dvdrental-#     THEN (tblpages-est_tblpages_ff)*bs
dvdrental-#     ELSE 0
dvdrental-#   END AS bloat_size,
dvdrental-#   CASE WHEN tblpages - est_tblpages_ff > 0
dvdrental-#     THEN 100 * (tblpages - est_tblpages_ff)/tblpages::float
dvdrental-#     ELSE 0
dvdrental-#   END AS bloat_pct, is_na
dvdrental-#   -- , tpl_hdr_size, tpl_data_size, (pst).free_percent + (pst).dead_tuple_percent AS real_frag -- (DEBUG INFO)
dvdrental-# FROM (
dvdrental(#   SELECT ceil( reltuples / ( (bs-page_hdr)/tpl_size ) ) + ceil( toasttuples / 4 ) AS est_tblpages,
dvdrental(#     ceil( reltuples / ( (bs-page_hdr)*fillfactor/(tpl_size*100) ) ) + ceil( toasttuples / 4 ) AS est_tblpages_ff,
dvdrental(#     tblpages, fillfactor, bs, tblid, schemaname, tblname, heappages, toastpages, is_na
dvdrental(#     -- , tpl_hdr_size, tpl_data_size, pgstattuple(tblid) AS pst -- (DEBUG INFO)
dvdrental(#   FROM (
dvdrental(#     SELECT
dvdrental(#       ( 4 + tpl_hdr_size + tpl_data_size + (2*ma)
dvdrental(#         - CASE WHEN tpl_hdr_size%ma = 0 THEN ma ELSE tpl_hdr_size%ma END
dvdrental(#         - CASE WHEN ceil(tpl_data_size)::int%ma = 0 THEN ma ELSE ceil(tpl_data_size)::int%ma END
dvdrental(#       ) AS tpl_size, bs - page_hdr AS size_per_block, (heappages + toastpages) AS tblpages, heappages,
dvdrental(#       toastpages, reltuples, toasttuples, bs, page_hdr, tblid, schemaname, tblname, fillfactor, is_na
dvdrental(#       -- , tpl_hdr_size, tpl_data_size
dvdrental(#     FROM (
dvdrental(#       SELECT
dvdrental(#         tbl.oid AS tblid, ns.nspname AS schemaname, tbl.relname AS tblname, tbl.reltuples,
dvdrental(#         tbl.relpages AS heappages, coalesce(toast.relpages, 0) AS toastpages,
dvdrental(#         coalesce(toast.reltuples, 0) AS toasttuples,
dvdrental(#         coalesce(substring(
dvdrental(#           array_to_string(tbl.reloptions, ' ')
dvdrental(#           FROM 'fillfactor=([0-9]+)')::smallint, 100) AS fillfactor,
dvdrental(#         current_setting('block_size')::numeric AS bs,
dvdrental(#         CASE WHEN version()~'mingw32' OR version()~'64-bit|x86_64|ppc64|ia64|amd64' THEN 8 ELSE 4 END AS ma,

dvdrental(#         24 AS page_hdr,
dvdrental(#         23 + CASE WHEN MAX(coalesce(s.null_frac,0)) > 0 THEN ( 7 + count(s.attname) ) / 8 ELSE 0::int END
dvdrental(#            + CASE WHEN bool_or(att.attname = 'oid' and att.attnum < 0) THEN 4 ELSE 0 END AS tpl_hdr_size,
dvdrental(#         sum( (1-coalesce(s.null_frac, 0)) * coalesce(s.avg_width, 0) ) AS tpl_data_size,
dvdrental(#         bool_or(att.atttypid = 'pg_catalog.name'::regtype)
dvdrental(#           OR sum(CASE WHEN att.attnum > 0 THEN 1 ELSE 0 END) <> count(s.attname) AS is_na
dvdrental(#       FROM pg_attribute AS att
dvdrental(#         JOIN pg_class AS tbl ON att.attrelid = tbl.oid
dvdrental(#         JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
dvdrental(#         LEFT JOIN pg_stats AS s ON s.schemaname=ns.nspname
dvdrental(#           AND s.tablename = tbl.relname AND s.inherited=false AND s.attname=att.attname
dvdrental(#         LEFT JOIN pg_class AS toast ON tbl.reltoastrelid = toast.oid
dvdrental(#       WHERE NOT att.attisdropped
dvdrental(#         AND tbl.relname not like '%pg%'
dvdrental(#         AND tbl.relkind in ('r','m')
dvdrental(#       GROUP BY 1,2,3,4,5,6,7,8,9,10
dvdrental(#       ORDER BY 2,3
dvdrental(#     ) AS s
dvdrental(#   ) AS s2
dvdrental(# ) AS s3
dvdrental-# -- WHERE NOT is_na
dvdrental-# --   AND tblpages*((pst).free_percent + (pst).dead_tuple_percent)::float4/100 >= 1
dvdrental-# ORDER BY bloat_pct DESC;
 current_database |     schemaname     |         tblname         | real_size | extra_size |     extra_pct      | fillfactor | bloat_size |     bloat_pct      | is_na
------------------+--------------------+-------------------------+-----------+------------+--------------------+------------+------------+--------------------+-------
 dvdrental        | public             | film                    |    720896 |     303104 |  42.04545454545455 |        100 |     303104 |  42.04545454545455 | f
 dvdrental        | public             | city                    |     40960 |       8192 |                 20 |        100 |       8192 |                 20 | f
 dvdrental        | public             | address                 |     65536 |       8192 |               12.5 |        100 |       8192 |               12.5 | f
 dvdrental        | public             | customer                |     73728 |       8192 |  11.11111111111111 |        100 |       8192 |  11.11111111111111 | f
 dvdrental        | public             | rental                  |   1228800 |     131072 | 10.666666666666666 |        100 |     131072 | 10.666666666666666 | f
 dvdrental        | public             | category                |      8192 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | country                 |      8192 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | film_actor              |    245760 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | film_category           |     49152 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | inventory               |    204800 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | language                |      8192 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | my_table                |         0 |          0 |                  0 |        100 |          0 |                  0 | t
 dvdrental        | public             | payment                 |    884736 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | staff                   |      8192 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | store                   |      8192 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | information_schema | sql_features            |     65536 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | test                    |         0 |          0 |                  0 |        100 |          0 |                  0 | t
 dvdrental        | information_schema | sql_implementation_info |      8192 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | information_schema | sql_parts               |      8192 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | information_schema | sql_sizing              |      8192 |          0 |                  0 |        100 |          0 |                  0 | f
 dvdrental        | public             | actor                   |     16384 |          0 |                  0 |        100 |          0 |                  0 | f
(21 行)
```

* table_stats.sql

テーブルを構成するデータの統計値を取得します
```sql
dvdrental=# SELECT
dvdrental-#     attname,
dvdrental-#     n_distinct,
dvdrental-#     most_common_vals,
dvdrental-#     most_common_freqs
dvdrental-# FROM
dvdrental-#     pg_stats
dvdrental-# WHERE
dvdrental-#     tablename = 'actor';
   attname   | n_distinct |
                                                                                                   most_common_vals     
                                                                   |
                                                                                       most_common_freqs


-------------+------------+----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 actor_id    |         -1 |


                                                                   |
 last_update |          1 | {"2013-05-26 14:47:57.62"}


                                                                   | {1}
 first_name  |      -0.64 | {Julia,Kenneth,Penelope,Burt,Cameron,Christian,Cuba,Dan,Ed,Fay,Gene,Groucho,Jayne,Matthew,Morgan,Nick,Russell,Adam,Albert,Angela,Audrey,Ben,Cate,Chris,Christopher,Daryl,Frances,Gary,Greta,Humphrey,Johnny,Kevin,Kirsten,Lucille,Mary,Mena,Meryl,Michael,Milla,Minnie,Reese,Renee,Rip,Sandra,Scarlett,Sean,Spencer,Susan,Tom,Vivien,Warren,Woody}                                                             | {0.02,0.02,0.02,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01}
 last_name   |     -0.605 | {Kilmer,Nolte,Temple,Akroyd,Allen,Berry,Davis,Degeneres,Garland,Guiness,Harris,Hoffman,Hopkins,Johansson,Keitel,Peck,Torn,Williams,Willis,Zellweger,Bailey,Bening,Bolger,Brody,Cage,Chase,Crawford,Cronyn,Dean,Dee,Dench,Depp,Dukakis,Fawcett,Gooding,Hackman,Hopper,Jackman,Mcconaughey,Mckellen,Mcqueen,Monroe,Mostel,Neeson,Olivier,Paltrow,Penn,Silverstone,Streep,Tandy,Tracy,Wahlberg,West,Winslet,Wood} | {0.025,0.02,0.02,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01}
(4 行)
```
* table_with_column.sql

指定したカラムが存在するテーブルを取得します

```sql
dvdrental=# -- credit: https://dataedo.com/kb/query/postgresql/find-tables-with-specific-column-name
dvdrental=# -- formatted to taste
dvdrental=# SELECT
dvdrental-#   t.table_schema,
dvdrental-#   t.table_name
dvdrental-# FROM
dvdrental-#   information_schema.tables t
dvdrental-#   INNER JOIN
dvdrental-#     information_schema.columns c
dvdrental-#     ON c.table_name = t.table_name
dvdrental-#     AND c.table_schema = t.table_schema
dvdrental-# WHERE
dvdrental-#   c.column_name = 'first_name'
dvdrental-#   AND t.table_schema NOT IN
dvdrental-#   (
dvdrental(#     'information_schema',
dvdrental(#     'pg_catalog'
dvdrental(#   )
dvdrental-#   AND t.table_type = 'BASE TABLE'
dvdrental-# ORDER BY
dvdrental-#   t.table_schema;
 table_schema | table_name
--------------+------------
 public       | customer
 public       | actor
 public       | staff
(3 行)
```
* tables_with_index_usage_counts.sql

インデックスを使用する時間の割合を取得します
```sql
dvdrental=# -- https://www.craigkerstiens.com/2012/10/01/understanding-postgres-performance/
dvdrental=# SELECT
dvdrental-#     relname,
dvdrental-#     100 * idx_scan / (seq_scan + idx_scan) percent_of_times_index_used,
dvdrental-#     n_live_tup rows_in_table
dvdrental-# FROM
dvdrental-#     pg_stat_user_tables
dvdrental-# WHERE
dvdrental-#     seq_scan + idx_scan > 0
dvdrental-# ORDER BY
dvdrental-#     n_live_tup DESC;
    relname    | percent_of_times_index_used | rows_in_table
---------------+-----------------------------+---------------
 rental        |                           0 |         16044
 payment       |                          14 |         14596
 film_actor    |                           0 |          5462
 inventory     |                           0 |          4581
 film          |                           0 |          1000
 film_category |                           0 |          1000
 address       |                          50 |           603
 city          |                           0 |           600
 customer      |                           0 |           599
 actor         |                          22 |           200
 country       |                           0 |           109
 category      |                           0 |            16
 language      |                           0 |             6
 staff         |                          20 |             2
 store         |                           0 |             2
 my_table      |                           0 |             0
(16 行)
```

* top_10_tables_by_row_count.sql

行数の多いテーブルトップ10を取得します
```sql
dvdrental=# SELECT
dvdrental-#     table_schema || '.' || table_name AS table_full_name,
dvdrental-#     reltuples::bigint AS row_count
dvdrental-# FROM
dvdrental-#     pg_class c
dvdrental-#     JOIN pg_namespace n ON n.oid = c.relnamespace
dvdrental-#     JOIN information_schema.tables t ON t.table_schema = n.nspname
dvdrental-#         AND t.table_name = c.relname
dvdrental-# WHERE
dvdrental-#     t.table_type = 'BASE TABLE'
dvdrental-#     AND t.table_schema NOT IN ('pg_catalog', 'information_schema', 'temp')
dvdrental-# ORDER BY
dvdrental-#     reltuples DESC
dvdrental-# LIMIT 10;
   table_full_name    | row_count
----------------------+-----------
 public.rental        |     16044
 public.payment       |     14596
 public.film_actor    |      5462
 public.inventory     |      4581
 public.film_category |      1000
 public.film          |      1000
 public.address       |       603
 public.city          |       600
 public.customer      |       599
 public.actor         |       200
(10 行)
```

* top_10_tables_by_size.sql

サイズの大きいテーブルトップ10を取得します
```sql
dvdrental=# -- Top 10 largest by size, excluding some
dvdrental=# -- internal schemas
dvdrental=# SELECT
dvdrental-#     table_schema || '.' || table_name AS table_full_name,
dvdrental-#     pg_total_relation_size(table_schema || '.' || table_name) AS total_size,
dvdrental-#     pg_size_pretty(pg_total_relation_size(table_schema || '.' || table_name)) AS total_size_pretty
dvdrental-# FROM
dvdrental-#     information_schema.tables
dvdrental-# WHERE
dvdrental-#     table_type = 'BASE TABLE'
dvdrental-#     AND table_schema NOT IN ('pg_catalog', 'information_schema', 'temp')
dvdrental-# ORDER BY
dvdrental-#     pg_total_relation_size(table_schema || '.' || table_name) DESC
dvdrental-# LIMIT 10;
   table_full_name    | total_size | total_size_pretty
----------------------+------------+-------------------
 public.rental        |    2408448 | 2352 kB
 public.payment       |    1859584 | 1816 kB
 public.film          |     958464 | 936 kB
 public.film_actor    |     499712 | 488 kB
 public.inventory     |     450560 | 440 kB
 public.customer      |     212992 | 208 kB
 public.address       |     155648 | 152 kB
 public.film_category |     114688 | 112 kB
 public.city          |     114688 | 112 kB
 public.actor         |      73728 | 72 kB
(10 行)
```

* top_updated_tables.sql

UPDATEが多いテーブルトップ10を取得します

```sql
dvdrental=# -- top updated tables, including HOT updates
dvdrental=# -- https://medium.com/nerd-for-tech/postgres-fillfactor-baf3117aca0a
dvdrental=# SELECT
dvdrental-#     schemaname,
dvdrental-#     relname,
dvdrental-#     pg_size_pretty(pg_total_relation_size(relname::regclass)) AS full_size,
dvdrental-#     pg_size_pretty(pg_relation_size(relname::regclass)) AS table_size,
dvdrental-#     pg_size_pretty(pg_total_relation_size(relname::regclass) - pg_relation_size(relname::regclass)) AS index_size,
dvdrental-#     n_tup_upd,
dvdrental-#     n_tup_hot_upd
dvdrental-# FROM
dvdrental-#     pg_stat_user_tables
dvdrental-# ORDER BY
dvdrental-#     n_tup_upd DESC
dvdrental-# LIMIT 10;
 schemaname |  relname   | full_size  | table_size | index_size | n_tup_upd | n_tup_hot_upd
------------+------------+------------+------------+------------+-----------+---------------
 public     | customer   | 208 kB     | 72 kB      | 136 kB     |         0 |             0
 public     | country    | 24 kB      | 8192 bytes | 16 kB      |         0 |             0
 public     | film       | 936 kB     | 704 kB     | 232 kB     |         0 |             0
 public     | category   | 24 kB      | 8192 bytes | 16 kB      |         0 |             0
 public     | language   | 24 kB      | 8192 bytes | 16 kB      |         0 |             0
 public     | test       | 8192 bytes | 0 bytes    | 8192 bytes |         0 |             0
 public     | film_actor | 488 kB     | 240 kB     | 248 kB     |         0 |             0
 public     | rental     | 2352 kB    | 1200 kB    | 1152 kB    |         0 |             0
 public     | staff      | 32 kB      | 8192 bytes | 24 kB      |         0 |             0
 public     | my_table   | 16 kB      | 0 bytes    | 16 kB      |         0 |             0
(10 行)
```

* vacuum_information_dead_tuples.sql

デッドタプルが多いテーブルトップ10を取得します

```sql
dvdrental=# --- Viewing top tables with lots of dead tuples
dvdrental=# SELECT schemaname, relname, n_live_tup, n_dead_tup, last_autovacuum
dvdrental-# FROM pg_stat_all_tables
dvdrental-# where relname not like 'pg_%'
dvdrental-# ORDER BY n_dead_tup
dvdrental-#     / (n_live_tup
dvdrental(#        * current_setting('autovacuum_vacuum_scale_factor')::float8
dvdrental(#           + current_setting('autovacuum_vacuum_threshold')::float8)
dvdrental-#      DESC
dvdrental-# LIMIT 10;
     schemaname     |   relname    | n_live_tup | n_dead_tup |       last_autovacuum
--------------------+--------------+------------+------------+------------------------------
 information_schema | sql_sizing   |         23 |          0 |
 public             | country      |        109 |          0 |
 public             | actor        |        200 |          0 |
 public             | city         |        600 |          0 |
 public             | store        |          2 |          0 |
 public             | film         |       1000 |          0 |
 public             | category     |         16 |          0 |
 public             | payment      |      14596 |          0 | 2024-09-08 10:44:24.49724+09
 information_schema | sql_features |        756 |          0 |
 public             | customer     |        599 |          0 |
(10 行)
```

* view_extensions.sql

導入済みの拡張機能一覧を取得します
```sql
dvdrental=# -- e.g. SELECT extname,extversion FROM pg_extension;
dvdrental=# -- e.g. pg_stat_statements version
dvdrental=# SELECT * FROM pg_extension;
  oid  |      extname       | extowner | extnamespace | extrelocatable | extversion | extconfig | extcondition
-------+--------------------+----------+--------------+----------------+------------+-----------+--------------
 15049 | plpgsql            |       10 |           11 | f              | 1.0        |           |
 18249 | pg_stat_statements |       10 |         2200 | t              | 1.10       |           |
(2 行)
```

* waiting_queries.sql

ロック解放待ちのクエリを取得します
```sql
dvdrental=# SELECT
dvdrental-#     pid,
dvdrental-#     wait_event_type,
dvdrental-#     wait_event,
dvdrental-#     LEFT (query,
dvdrental(#         60) AS query,
dvdrental-#     backend_start,
dvdrental-#     query_start,
dvdrental-#     (CURRENT_TIMESTAMP - query_start) AS ago
dvdrental-# FROM
dvdrental-#     pg_stat_activity
dvdrental-# WHERE
dvdrental-#     datname = 'dvdrental';
  pid  | wait_event_type | wait_event |                            query                             |         backend_start         |          query_start          |       ago
-------+-----------------+------------+--------------------------------------------------------------+-------------------------------+-------------------------------+-----------------
 20228 |                 |            | SELECT                                                      +| 2024-09-08 19:03:08.967448+09 | 2024-09-08 19:43:00.712825+09 | 00:00:00
       |                 |            |     pid,                                                    +|
             |                               |
       |                 |            |     wait_event_type,                                        +|
             |                               |
       |                 |            |     wait_event,                                             +|
             |                               |
       |                 |            |     LEF                                                      |
             |                               |
  2056 | Client          | ClientRead | lock actor;                                                  | 2024-09-08 19:41:50.923561+09 | 2024-09-08 19:42:03.600176+09 | 00:00:57.112649
  3244 | Lock            | relation   | SELECT * from actor;                                         | 2024-09-08 19:42:15.933675+09 | 2024-09-08 19:42:23.136253+09 | 00:00:37.576572
 16400 | Client          | ClientRead | SELECT DISTINCT att.attname as name, att.attnum as OID, pg_c | 2024-09-08 19:27:38.693773+09 | 2024-09-08 19:27:40.32982+09  | 00:15:20.383005
(4 行)
```

以上で、現時点におけるクエリの確認は終了です。