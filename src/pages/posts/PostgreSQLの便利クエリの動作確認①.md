---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'PostgreSQLの便利クエリの動作確認①'
pubDate: 2024-09-07
description: 'PostgreSQL'
tags: ["PostgreSQL"]
---

便利なクエリをまとめているリポジトリを見つけたので実際に動作させて確認してみた。

https://github.com/andyatkinson/pg_scripts

量が多いので、何回かに分けて確認します。  
いくつかのクエリは機能が重複している可能性があります。

## バージョン
```sql
dvdrental=# SELECT version();
                          version
------------------------------------------------------------
 PostgreSQL 16.2, compiled by Visual C++ build 1937, 64-bit
(1 行)
```

## データ
次のダンプを使用します  

https://www.postgresqltutorial.com/postgresql-getting-started/postgresql-sample-database/


接続します
```sh
psql -U postgres -d dvdrental
```

## スクリプト実行

* approximate_count.sql

カタログテーブルから行数概算を取得する。  
`ANALYZE`直後なら正確

```sql
dvdrental=# -- Approximate row counts
dvdrental=# SELECT relname, relpages, reltuples::numeric, relallvisible, relkind, relnatts, relhassubclass, reloptions, pg_table_size(oid) FROM pg_class WHERE relname='actor';
 relname | relpages | reltuples | relallvisible | relkind | relnatts | relhassubclass |   reloptions    | pg_table_size
---------+----------+-----------+---------------+---------+----------+----------------+-----------------+---------------
 actor   |        2 |       200 |             0 | r       |        4 | f              | {fillfactor=80} |         16384
(1 行)


dvdrental=#
dvdrental=# -- Simplified
dvdrental=# SELECT reltuples::numeric FROM pg_class WHERE relname='actor';
 reltuples
-----------
       200
(1 行)

dvdrental=# CREATE OR REPLACE FUNCTION counte(tbl text)
dvdrental-# RETURNS NUMERIC AS $$
dvdrental$#   SELECT reltuples::NUMERIC FROM pg_class WHERE relname=tbl;
dvdrental$# $$ LANGUAGE sql;

dvdrental=# SELECT counte('actor');
 counte
--------
    200
(1 行)
```
* cache_hit_rate.sql

キャッシュのヒット率
```sql
dvdrental=# -- https://www.craigkerstiens.com/2012/10/01/understanding-postgres-performance/
dvdrental=# SELECT
dvdrental-#   sum(heap_blks_read) as heap_read,
dvdrental-#   sum(heap_blks_hit)  as heap_hit,
dvdrental-#   sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
dvdrental-# FROM
dvdrental-#   pg_statio_user_tables;
 heap_read | heap_hit |         ratio
-----------+----------+------------------------
         2 |     6291 | 0.99968218655649133958
(1 行)
```
* concurrent_index_build_progress.sql

concurentlyなインデックスの作成進捗の確認
```sql
dvdrental=# -- Check the status of the index build
dvdrental=# SELECT
dvdrental-#   now()::TIME(0),
dvdrental-#   a.query,
dvdrental-#   p.phase,
dvdrental-#   round(p.blocks_done / p.blocks_total::numeric * 100, 2) AS "% done",
dvdrental-#   p.blocks_total,
dvdrental-#   p.blocks_done,
dvdrental-#   p.tuples_total,
dvdrental-#   p.tuples_done,
dvdrental-#   ai.schemaname,
dvdrental-#   ai.relname,
dvdrental-#   ai.indexrelname
dvdrental-# FROM pg_stat_progress_create_index p
dvdrental-# JOIN pg_stat_activity a ON p.pid = a.pid
dvdrental-# LEFT JOIN pg_stat_all_indexes ai on ai.relid = p.relid AND ai.indexrelid = p.index_relid;
 now | query | phase | % done | blocks_total | blocks_done | tuples_total | tuples_done | schemaname | relname | indexrelname
-----+-------+-------+--------+--------------+-------------+--------------+-------------+------------+---------+--------------
(0 行)
```
* constraint_definition_ddl.sql

pgadminのように制約の定義を確認する
```sql
dvdrental=# -- https://dba.stackexchange.com/a/298038/272968
dvdrental=# SELECT
dvdrental-#   connamespace::regnamespace AS schema,
dvdrental-#   conrelid::regclass AS table,
dvdrental-#   conname AS constraint,
dvdrental-#   pg_get_constraintdef(oid) AS definition,
dvdrental-#   format ('ALTER TABLE %I.%I ADD CONSTRAINT %I %s;', connamespace::regnamespace,
dvdrental(#    conrelid::regclass,
dvdrental(#    conname,
dvdrental(#    pg_get_constraintdef(oid) )
dvdrental-# FROM
dvdrental-#   pg_constraint
dvdrental-# WHERE
dvdrental-#   conname IN ('fk_address_city');
 schema |  table  |   constraint    |                   definition                   |                                                  format

--------+---------+-----------------+------------------------------------------------+-----------------------------------------------------------------------------------------------------------
 public | address | fk_address_city | FOREIGN KEY (city_id) REFERENCES city(city_id) | ALTER TABLE public.address ADD CONSTRAINT fk_address_city FOREIGN KEY (city_id) REFERENCES city(city_id);
(1 行)
```
* create_index_create_statement.sql

インデックスからクエリを生成する
```sql
dvdrental=# SELECT
dvdrental-#     indexdef
dvdrental-# FROM
dvdrental-#     pg_indexes
dvdrental-# WHERE
dvdrental-#     indexname = 'idx_actor_last_name';
                                 indexdef
--------------------------------------------------------------------------
 CREATE INDEX idx_actor_last_name ON public.actor USING btree (last_name)
(1 行)

```

* detect_transaction_id_wraparound.sql

トランザクションIDの周回を検知する

```sql
dvdrental=# -- TXID is a global value
dvdrental=# --
dvdrental=# -- Goal: Detect tables that will likely be
dvdrental=# -- force vacuummed soon due to transaction ID wraparound
dvdrental=# --
dvdrental=# -- https://blog.crunchydata.com/blog/managing-transaction-id-wraparound-in-postgresql
dvdrental=# WITH max_age AS (
dvdrental(#     SELECT 2000000000 as max_old_xid
dvdrental(#         , setting AS autovacuum_freeze_max_age
dvdrental(#         FROM pg_catalog.pg_settings
dvdrental(#         WHERE name = 'autovacuum_freeze_max_age' )
dvdrental-# , per_database_stats AS (
dvdrental(#     SELECT datname
dvdrental(#         , m.max_old_xid::int
dvdrental(#         , m.autovacuum_freeze_max_age::int
dvdrental(#         , age(d.datfrozenxid) AS oldest_current_xid
dvdrental(#     FROM pg_catalog.pg_database d
dvdrental(#     JOIN max_age m ON (true)
dvdrental(#     WHERE d.datallowconn )
dvdrental-# SELECT max(oldest_current_xid) AS oldest_current_xid
dvdrental-#     , max(ROUND(100*(oldest_current_xid/max_old_xid::float))) AS percent_towards_wraparound
dvdrental-#     , max(ROUND(100*(oldest_current_xid/autovacuum_freeze_max_age::float))) AS percent_towards_emergency_autovac
dvdrental-# FROM per_database_stats;
 oldest_current_xid | percent_towards_wraparound | percent_towards_emergency_autovac
--------------------+----------------------------+-----------------------------------
              74214 |                          0 |                                 0
(1 行)


dvdrental=#
dvdrental=#
dvdrental=# -- Using autovacuum_freeze_max_age default value of 200 million
dvdrental=# -- Script below checks for 190 million
dvdrental=# -- credit: David R.
dvdrental=# --
dvdrental=# -- Potential fix is to: `vacuum freeze <table>` the specific tables
dvdrental=# --
dvdrental=# SELECT
dvdrental-#     relname,
dvdrental-#     age(relfrozenxid),
dvdrental-#     pg_size_pretty(pg_relation_size(oid)) AS size
dvdrental-# FROM
dvdrental-#     pg_Class
dvdrental-# WHERE
dvdrental-#     age(relfrozenxid) > 190000000
dvdrental-#     AND relkind = 'r';
 relname | age | size
---------+-----+------
(0 行)
```
* find_dbid_database_oid.sql

データベースのオブジェクトIDを取得
```sql
dvdrental=# -- pg_stat_statements uses dbid column
dvdrental=# SELECT
dvdrental-#     pg_database.oid
dvdrental-# FROM
dvdrental-#     pg_database
dvdrental-# WHERE
dvdrental-#     pg_database.datname = 'dvdrental';
  oid
-------
 17075
(1 行)
```

* find_hot_updates.sql

更新頻度の高いテーブルとそのフィルファクターの確認・変更のクエリ。  
更新が多いテーブルはフィルファクターを下げると、パフォーマンスが上がる場合がある。
```sql
dvdrental=# -- We want to find the number of hot updates
dvdrental=# -- for all tables, but focus on tables with a high UPDATE
dvdrental=# -- rate and high value tables
dvdrental=#
dvdrental=# -- For rideshare, scope this to the 'public' schema
dvdrental=# SELECT
dvdrental-#     schemaname,
dvdrental-#     relname,
dvdrental-#     n_tup_hot_upd
dvdrental-# FROM
dvdrental-#     pg_stat_all_tables
dvdrental-# WHERE
dvdrental-#     schemaname = 'public'
dvdrental-# ORDER BY
dvdrental-#     n_tup_hot_upd DESC;
 schemaname |    relname    | n_tup_hot_upd
------------+---------------+---------------
 public     | category      |             0
 public     | film          |             0
 public     | language      |             0
 public     | staff         |             0
 public     | film_category |             0
 public     | rental        |             0
 public     | customer      |             0
 public     | city          |             0
 public     | actor         |             0
 public     | country       |             0
 public     | payment       |             0
 public     | address       |             0
 public     | store         |             0
 public     | film_actor    |             0
 public     | inventory     |             0
(15 行)


dvdrental=#
dvdrental=# -- Check the "n_tup_hot_upd" field tables
dvdrental=#
dvdrental=# -- For those tables, check the indexes
dvdrental=# -- Check pg_stat_statements for update statements in that table
dvdrental=# SELECT
dvdrental-#     nspname AS schema_name,
dvdrental-#     relname AS table_name,
dvdrental-#     CASE WHEN array_length(reloptions, 1) IS NULL THEN
dvdrental-#         '100' -- Default fillfactor value
dvdrental-#     ELSE
dvdrental-#         (
dvdrental(#             SELECT
dvdrental(#                 substring(reloptions[i] FROM 12) -- Extract the fillfactor value
dvdrental(#             FROM
dvdrental(#                 generate_series(array_lower(reloptions, 1), array_upper(reloptions, 1)) AS s (i)
dvdrental(#             WHERE
dvdrental(#                 reloptions[i] LIKE 'fillfactor%')
dvdrental-#     END AS fillfactor
dvdrental-# FROM
dvdrental-#     pg_class
dvdrental-#     JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
dvdrental-# WHERE
dvdrental-#     relkind = 'r' -- 'r' is for ordinary tables
dvdrental-#     AND nspname = 'public'
dvdrental-# ORDER BY
dvdrental-#     schema_name,
dvdrental-#     table_name;
 schema_name |  table_name   | fillfactor
-------------+---------------+------------
 public      | actor         | 100
 public      | address       | 100
 public      | category      | 100
 public      | city          | 100
 public      | country       | 100
 public      | customer      | 100
 public      | film          | 100
 public      | film_actor    | 100
 public      | film_category | 100
 public      | inventory     | 100
 public      | language      | 100
 public      | payment       | 100
 public      | rental        | 100
 public      | staff         | 100
 public      | store         | 100
(15 行)


dvdrental=#
dvdrental=#
dvdrental=# -- Using "actor" table as an example, with a default fillfactor
dvdrental=# -- of 100, let's lower it to 80
dvdrental=# ALTER TABLE public.actor SET (fillfactor = 80);
ALTER TABLE
dvdrental=#
dvdrental=# -- To rebuild the table, run a VACUUM FULL
dvdrental=# VACUUM (FULL, VERBOSE) public.actor;
INFO:  "public.actor"に対してVACUUMを実行しています
INFO:  "public.actor": 2 ページ中に見つかった行バージョン: 移動可能 0 行、削除不可 200 行
DETAIL:  0 個の無効な行が今はまだ削除できません。
CPU: ユーザー: 0.00秒、システム: 0.00秒、経過時間: 0.00秒.
VACUUM

```

* find_indexed_columns_high_null_frac.sql

インデックスをNULLが高い割合を占めないかチェックします  
ヒットするインデックスがあり、NULLで検索をしない場合は部分インデックスを適用することでストレージサイズを減らすことができます。
```sql
dvdrental=# -- Credit: https://hakibenita.com/postgresql-unused-index-size#clearing-bloat-in-indexes
dvdrental=# -- Find indexed columns with high null_frac
dvdrental=# SELECT
dvdrental-#     c.oid,
dvdrental-#     c.relname AS index,
dvdrental-#     pg_size_pretty(pg_relation_size(c.oid)) AS index_size,
dvdrental-#     i.indisunique AS unique,
dvdrental-#     a.attname AS indexed_column,
dvdrental-#     CASE s.null_frac
dvdrental-#         WHEN 0 THEN ''
dvdrental-#         ELSE to_char(s.null_frac * 100, '999.00%')
dvdrental-#     END AS null_frac,
dvdrental-#     pg_size_pretty((pg_relation_size(c.oid) * s.null_frac)::bigint) AS expected_saving
dvdrental-#     -- Uncomment to include the index definition
dvdrental-#     --, ixs.indexdef
dvdrental-#
dvdrental-# FROM
dvdrental-#     pg_class c
dvdrental-#     JOIN pg_index i ON i.indexrelid = c.oid
dvdrental-#     JOIN pg_attribute a ON a.attrelid = c.oid
dvdrental-#     JOIN pg_class c_table ON c_table.oid = i.indrelid
dvdrental-#     JOIN pg_indexes ixs ON c.relname = ixs.indexname
dvdrental-#     LEFT JOIN pg_stats s ON s.tablename = c_table.relname AND a.attname = s.attname
dvdrental-#
dvdrental-# WHERE
dvdrental-#     -- Primary key cannot be partial
dvdrental-#     NOT i.indisprimary
dvdrental-#
dvdrental-#     -- Exclude already partial indexes
dvdrental-#     AND i.indpred IS NULL
dvdrental-#
dvdrental-#     -- Exclude composite indexes
dvdrental-#     AND array_length(i.indkey, 1) = 1
dvdrental-#
dvdrental-#     -- Larger than 10MB
dvdrental-#     AND pg_relation_size(c.oid) > 10 * 1024 ^ 2
dvdrental-#
dvdrental-# ORDER BY
dvdrental-#     pg_relation_size(c.oid) * s.null_frac DESC;
 oid | index | index_size | unique | indexed_column | null_frac | expected_saving
-----+-------+------------+--------+----------------+-----------+-----------------
(0 行)
```

* find_missing_indexes.sql

インデックス スキャンよりもシーケンススキャンの方が多いかどうかをチェックします。テーブルが小さい場合は、Postgresがシーケンス スキャンを優先するため、無視されます。

欠落しているインデックスが明らかになります。

```sql
dvdrental=# -- Find missing indexes (look at seq_scan counts)
dvdrental=# -- https://stackoverflow.com/a/12818168/126688
dvdrental=# SELECT
dvdrental-#   relname                                               AS TableName,
dvdrental-#   TO_CHAR(seq_scan, '999,999,999,999')                  AS TotalSeqScan,
dvdrental-#   TO_CHAR(idx_scan, '999,999,999,999')                  AS TotalIndexScan,
dvdrental-#   TO_CHAR(n_live_tup, '999,999,999,999')                AS TableRows,
dvdrental-#   PG_SIZE_PRETTY(PG_RELATION_SIZE(relname::REGCLASS))   AS TableSize
dvdrental-# FROM pg_stat_all_tables
dvdrental-# WHERE schemaname = 'public' -- change schema name, i.e. 'rideshare' if not 'public'
dvdrental-#   -- AND 50 * seq_scan > idx_scan -- more than 2%, add filters to narrow down results
dvdrental-#   -- AND n_live_tup > 10000 -- narrow down results for bigger tables
dvdrental-#   -- AND pg_relation_size(relname::REGCLASS) > 5000000
dvdrental-# ORDER BY totalseqscan DESC;
   tablename   |   totalseqscan   |  totalindexscan  |    tablerows     | tablesize
---------------+------------------+------------------+------------------+------------
 film          |                8 |                0 |            1,000 | 704 kB
 customer      |                7 |                0 |              599 | 72 kB
 rental        |                7 |                0 |           16,044 | 1200 kB
 payment       |                6 |                1 |           14,596 | 864 kB
 inventory     |                4 |                0 |            4,581 | 200 kB
 staff         |                4 |                1 |                2 | 8192 bytes
 city          |                4 |                0 |              600 | 40 kB
 address       |                4 |                4 |              603 | 64 kB
 store         |                4 |                0 |                2 | 8192 bytes
 film_actor    |                4 |                0 |            5,462 | 240 kB
 film_category |                3 |                0 |            1,000 | 48 kB
 actor         |                3 |                0 |              200 | 16 kB
 language      |                2 |                0 |                6 | 8192 bytes
 category      |                2 |                0 |               16 | 8192 bytes
 country       |                2 |                0 |              109 | 8192 bytes
(15 行)


dvdrental=#
dvdrental=#
dvdrental=# -- missing indexes from GCP docs:
dvdrental=# -- Optimize CPU usage
dvdrental=# -- https://cloud.google.com/sql/docs/postgres/optimize-cpu-usage
dvdrental=# SELECT
dvdrental-#     relname,
dvdrental-#     idx_scan,
dvdrental-#     seq_scan,
dvdrental-#     n_live_tup
dvdrental-# FROM
dvdrental-#     pg_stat_user_tables
dvdrental-# WHERE
dvdrental-#     seq_scan > 0
dvdrental-# ORDER BY
dvdrental-#     n_live_tup DESC;
    relname    | idx_scan | seq_scan | n_live_tup
---------------+----------+----------+------------
 rental        |        0 |        7 |      16044
 payment       |        1 |        6 |      14596
 film_actor    |        0 |        4 |       5462
 inventory     |        0 |        4 |       4581
 film          |        0 |        8 |       1000
 film_category |        0 |        3 |       1000
 address       |        4 |        4 |        603
 city          |        0 |        4 |        600
 customer      |        0 |        7 |        599
 actor         |        0 |        3 |        200
 country       |        0 |        2 |        109
 category      |        0 |        2 |         16
 language      |        0 |        2 |          6
 staff         |        1 |        4 |          2
 store         |        0 |        4 |          2
(15 行)
```
* find_replica_identity.sql

テーブルのレプリカIDを見つける
```sql
dvdrental=# -- https://stackoverflow.com/a/55249601/20444500
dvdrental=# SELECT CASE relreplident
dvdrental-#           WHEN 'd' THEN 'default'
dvdrental-#           WHEN 'n' THEN 'nothing'
dvdrental-#           WHEN 'f' THEN 'full'
dvdrental-#           WHEN 'i' THEN 'index'
dvdrental-#        END AS replica_identity
dvdrental-# FROM pg_class
dvdrental-# WHERE oid = 'actor'::regclass;
 replica_identity
------------------
 default
(1 行)
```

* find_unused_indexes.sql

膨張したインデックスを発見します。

```sql
dvdrental=# -- Credit: http://www.databasesoup.com/2014/04/new-new-index-bloat-query.html
dvdrental=# -- Original: https://gist.github.com/jberkus/6b1bcaf7724dfc2a54f3
dvdrental=#
dvdrental=# -- NOTES:
dvdrental=#
dvdrental=# WITH table_scans as (
dvdrental(#     SELECT relid,
dvdrental(#         tables.idx_scan + tables.seq_scan as all_scans,
dvdrental(#         ( tables.n_tup_ins + tables.n_tup_upd + tables.n_tup_del ) as writes,
dvdrental(#                 pg_relation_size(relid) as table_size
dvdrental(#         FROM pg_stat_user_tables as tables
dvdrental(# ),
dvdrental-# all_writes as (
dvdrental(#     SELECT sum(writes) as total_writes
dvdrental(#     FROM table_scans
dvdrental(# ),
dvdrental-# indexes as (
dvdrental(#     SELECT idx_stat.relid, idx_stat.indexrelid,
dvdrental(#         idx_stat.schemaname, idx_stat.relname as tablename,
dvdrental(#         idx_stat.indexrelname as indexname,
dvdrental(#         idx_stat.idx_scan,
dvdrental(#         pg_relation_size(idx_stat.indexrelid) as index_bytes,
dvdrental(#         indexdef ~* 'USING btree' AS idx_is_btree
dvdrental(#     FROM pg_stat_user_indexes as idx_stat
dvdrental(#         JOIN pg_index
dvdrental(#             USING (indexrelid)
dvdrental(#         JOIN pg_indexes as indexes
dvdrental(#             ON idx_stat.schemaname = indexes.schemaname
dvdrental(#                 AND idx_stat.relname = indexes.tablename
dvdrental(#                 AND idx_stat.indexrelname = indexes.indexname
dvdrental(#     WHERE pg_index.indisunique = FALSE
dvdrental(# ),
dvdrental-# index_ratios AS (
dvdrental(# SELECT schemaname, tablename, indexname,
dvdrental(#     idx_scan, all_scans,
dvdrental(#     round(( CASE WHEN all_scans = 0 THEN 0.0::NUMERIC
dvdrental(#         ELSE idx_scan::NUMERIC/all_scans * 100 END),2) as index_scan_pct,
dvdrental(#     writes,
dvdrental(#     round((CASE WHEN writes = 0 THEN idx_scan::NUMERIC ELSE idx_scan::NUMERIC/writes END),2)
dvdrental(#         as scans_per_write,
dvdrental(#     pg_size_pretty(index_bytes) as index_size,
dvdrental(#     pg_size_pretty(table_size) as table_size,
dvdrental(#     idx_is_btree, index_bytes
dvdrental(#     FROM indexes
dvdrental(#     JOIN table_scans
dvdrental(#     USING (relid)
dvdrental(# ),
dvdrental-# index_groups AS (
dvdrental(# SELECT 'Never Used Indexes' as reason, *, 1 as grp
dvdrental(# FROM index_ratios
dvdrental(# WHERE
dvdrental(#     idx_scan = 0
dvdrental(#     and idx_is_btree
dvdrental(# UNION ALL
dvdrental(# SELECT 'Low Scans, High Writes' as reason, *, 2 as grp
dvdrental(# FROM index_ratios
dvdrental(# WHERE
dvdrental(#     scans_per_write <= 1
dvdrental(#     and index_scan_pct < 10
dvdrental(#     and idx_scan > 0
dvdrental(#     and writes > 100
dvdrental(#     and idx_is_btree
dvdrental(# UNION ALL
dvdrental(# SELECT 'Seldom Used Large Indexes' as reason, *, 3 as grp
dvdrental(# FROM index_ratios
dvdrental(# WHERE
dvdrental(#     index_scan_pct < 5
dvdrental(#     and scans_per_write > 1
dvdrental(#     and idx_scan > 0
dvdrental(#     and idx_is_btree
dvdrental(#     and index_bytes > 100000000
dvdrental(# UNION ALL
dvdrental(# SELECT 'High-Write Large Non-Btree' as reason, index_ratios.*, 4 as grp
dvdrental(# FROM index_ratios, all_writes
dvdrental(# WHERE
dvdrental(#     ( writes::NUMERIC / ( total_writes + 1 ) ) > 0.02
dvdrental(#     AND NOT idx_is_btree
dvdrental(#     AND index_bytes > 100000000
dvdrental(# ORDER BY grp, index_bytes DESC )
dvdrental-# SELECT reason, schemaname, tablename, indexname,
dvdrental-#     index_scan_pct, scans_per_write, index_size, table_size
dvdrental-# FROM index_groups;
       reason       | schemaname | tablename  |      indexname       | index_scan_pct | scans_per_write | index_size | table_size
--------------------+------------+------------+----------------------+----------------+-----------------+------------+------------
 Never Used Indexes | public     | payment    | idx_fk_rental_id     |           0.00 |            0.00 | 336 kB     | 864 kB
 Never Used Indexes | public     | rental     | idx_fk_inventory_id  |           0.00 |            0.00 | 240 kB     | 1200 kB
 Never Used Indexes | public     | payment    | idx_fk_customer_id   |           0.00 |            0.00 | 128 kB     | 864 kB
 Never Used Indexes | public     | inventory  | idx_store_id_film_id |           0.00 |            0.00 | 88 kB      | 200 kB
 Never Used Indexes | public     | film_actor | idx_fk_film_id       |           0.00 |            0.00 | 80 kB      | 240 kB
 Never Used Indexes | public     | film       | idx_title            |           0.00 |            0.00 | 56 kB      | 704 kB
 Never Used Indexes | public     | customer   | idx_last_name        |           0.00 |            0.00 | 32 kB      | 72 kB
 Never Used Indexes | public     | address    | idx_fk_city_id       |           0.00 |            0.00 | 32 kB      | 64 kB
 Never Used Indexes | public     | customer   | idx_fk_address_id    |           0.00 |            0.00 | 32 kB      | 72 kB
 Never Used Indexes | public     | customer   | idx_fk_store_id      |           0.00 |            0.00 | 16 kB      | 72 kB
 Never Used Indexes | public     | actor      | idx_actor_last_name  |           0.00 |            0.00 | 16 kB      | 16 kB
 Never Used Indexes | public     | film       | idx_fk_language_id   |           0.00 |            0.00 | 16 kB      | 704 kB
 Never Used Indexes | public     | city       | idx_fk_country_id    |           0.00 |            0.00 | 16 kB      | 40 kB
(13 行)
```

* foreign_keys.sql

データベース内のすべての外部キーを表示する

```sql
dvdrental=# -- https://stackoverflow.com/a/73164028/126688
dvdrental=# SELECT conrelid::regclass AS table_name,
dvdrental-#        conname AS foreign_key,
dvdrental-#        pg_get_constraintdef(oid)
dvdrental-# FROM   pg_constraint
dvdrental-# WHERE  contype = 'f'
dvdrental-# AND    connamespace = 'public'::regnamespace
dvdrental-# ORDER  BY conrelid::regclass::text, contype DESC;
  table_name   |          foreign_key           |                                        pg_get_constraintdef

---------------+--------------------------------+----------------------------------------------------------------------------------------------------
 address       | fk_address_city                | FOREIGN KEY (city_id) REFERENCES city(city_id)
 city          | fk_city                        | FOREIGN KEY (country_id) REFERENCES country(country_id)
 customer      | customer_address_id_fkey       | FOREIGN KEY (address_id) REFERENCES address(address_id) ON UPDATE CASCADE ON DELETE RESTRICT
 film          | film_language_id_fkey          | FOREIGN KEY (language_id) REFERENCES language(language_id) ON UPDATE CASCADE ON DELETE RESTRICT
 film_actor    | film_actor_film_id_fkey        | FOREIGN KEY (film_id) REFERENCES film(film_id) ON UPDATE CASCADE ON DELETE RESTRICT
 film_actor    | film_actor_actor_id_fkey       | FOREIGN KEY (actor_id) REFERENCES actor(actor_id) ON UPDATE CASCADE ON DELETE RESTRICT
 film_category | film_category_film_id_fkey     | FOREIGN KEY (film_id) REFERENCES film(film_id) ON UPDATE CASCADE ON DELETE RESTRICT
 film_category | film_category_category_id_fkey | FOREIGN KEY (category_id) REFERENCES category(category_id) ON UPDATE CASCADE ON DELETE RESTRICT
 inventory     | inventory_film_id_fkey         | FOREIGN KEY (film_id) REFERENCES film(film_id) ON UPDATE CASCADE ON DELETE RESTRICT
 payment       | payment_customer_id_fkey       | FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT
 payment       | payment_rental_id_fkey         | FOREIGN KEY (rental_id) REFERENCES rental(rental_id) ON UPDATE CASCADE ON DELETE SET NULL
 payment       | payment_staff_id_fkey          | FOREIGN KEY (staff_id) REFERENCES staff(staff_id) ON UPDATE CASCADE ON DELETE RESTRICT
 rental        | rental_customer_id_fkey        | FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT
 rental        | rental_inventory_id_fkey       | FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON UPDATE CASCADE ON DELETE RESTRICT
 rental        | rental_staff_id_key            | FOREIGN KEY (staff_id) REFERENCES staff(staff_id)
 staff         | staff_address_id_fkey          | FOREIGN KEY (address_id) REFERENCES address(address_id) ON UPDATE CASCADE ON DELETE RESTRICT
 store         | store_address_id_fkey          | FOREIGN KEY (address_id) REFERENCES address(address_id) ON UPDATE CASCADE ON DELETE RESTRICT
 store         | store_manager_staff_id_fkey    | FOREIGN KEY (manager_staff_id) REFERENCES staff(staff_id) ON UPDATE CASCADE ON DELETE RESTRICT
(18 行)
```

* generate_add_foreign_keys_ddl_to_target_table.sql

外部キーを作成するクエリを生成します

```sql
dvdrental=# SELECT
dvdrental-#     'ALTER TABLE ' || nsp.nspname || '.' || cls.relname ||
dvdrental-#     ' ADD CONSTRAINT ' || conname ||
dvdrental-#     ' FOREIGN KEY (' || STRING_AGG(att.attname, ', ') OVER(PARTITION BY conname) || ')' ||
dvdrental-#     ' REFERENCES ' || refnsp.nspname || '.' || refcls.relname ||
dvdrental-#     ' (' || STRING_AGG(refatt.attname, ', ') OVER(PARTITION BY conname) || ')'
dvdrental-#     || CASE
dvdrental-#         WHEN confupdtype = 'c' THEN ' ON UPDATE CASCADE'
dvdrental-#         WHEN confupdtype = 'n' THEN ' ON UPDATE SET NULL'
dvdrental-#         WHEN confupdtype = 'd' THEN ' ON UPDATE SET DEFAULT'
dvdrental-#         ELSE ''
dvdrental-#     END ||
dvdrental-#     CASE
dvdrental-#         WHEN confdeltype = 'c' THEN ' ON DELETE CASCADE'
dvdrental-#         WHEN confdeltype = 'n' THEN ' ON DELETE SET NULL'
dvdrental-#         WHEN confdeltype = 'd' THEN ' ON DELETE SET DEFAULT'
dvdrental-#         ELSE ''
dvdrental-#     END || ';'
dvdrental-# FROM
dvdrental-#     pg_constraint con
dvdrental-# JOIN
dvdrental-#     pg_class cls ON con.conrelid = cls.oid
dvdrental-# JOIN
dvdrental-#     pg_namespace nsp ON cls.relnamespace = nsp.oid
dvdrental-# JOIN
dvdrental-#     pg_class refcls ON con.confrelid = refcls.oid
dvdrental-# JOIN
dvdrental-#     pg_namespace refnsp ON refcls.relnamespace = refnsp.oid
dvdrental-# JOIN
dvdrental-#     pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
dvdrental-# JOIN
dvdrental-#     pg_attribute refatt ON refatt.attnum = ANY(con.confkey) AND refatt.attrelid = con.confrelid
dvdrental-# WHERE
dvdrental-#     refcls.relname = 'actor'  -- replace with your table name
dvdrental-# AND
dvdrental-#     refnsp.nspname = 'public'  -- replace with your schema if different
dvdrental-# GROUP BY
dvdrental-#     conname, nsp.nspname, cls.relname, refnsp.nspname, refcls.relname, confupdtype, confdeltype, att.attname, refatt.attname;
                                                                      ?column?
---------------------------------------------------------------------------------------------------------------------------------------------------- ALTER TABLE public.film_actor ADD CONSTRAINT film_actor_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.actor (actor_id) ON UPDATE CASCADE;
(1 行)
```

* generate_data.sql

データ生成します
```sql
dvdrental=# SELECT * FROM generate_series(now() - '10 day'::interval, now(), '1 day');
        generate_series
-------------------------------
 2024-08-29 09:58:10.275358+09
 2024-08-30 09:58:10.275358+09
 2024-08-31 09:58:10.275358+09
 2024-09-01 09:58:10.275358+09
 2024-09-02 09:58:10.275358+09
 2024-09-03 09:58:10.275358+09
 2024-09-04 09:58:10.275358+09
 2024-09-05 09:58:10.275358+09
 2024-09-06 09:58:10.275358+09
 2024-09-07 09:58:10.275358+09
 2024-09-08 09:58:10.275358+09
(11 行)

dvdrental=# SELECT * FROM generate_series(1, 5);
 generate_series
-----------------
               1
               2
               3
               4
               5
(5 行)

```
* idle_sessions_count.sql

状態別にセッションを数えます
```sql
dvdrental=# SELECT
dvdrental-#   count(*),
dvdrental-#   state
dvdrental-# FROM pg_stat_activity
dvdrental-# GROUP BY 2;
 count | state
-------+--------
     5 |
     1 | active
     3 | idle
(3 行)
```

* idle_transactions.sql

実行中のトランザクションを確認します（別セッションで`BEGIN;`だけ発行すれば簡単に動作確認可）
```sql
dvdrental=# SELECT *
dvdrental-# FROM pg_stat_activity
dvdrental-# WHERE (state = 'idle in transaction')
dvdrental-# AND xact_start IS NOT NULL;
 datid |  datname  |  pid  | leader_pid | usesysid | usename  | application_name | client_addr | client_hostname | client_port |         backend_start         |          xact_start           |          query_start          |         state_change          | wait_event_type | wait_event |        state        | backend_xid | backend_xmin | query_id | query  |  backend_type
-------+-----------+-------+------------+----------+----------+------------------+-------------+-----------------+-------------+-------------------------------+-------------------------------+-------------------------------+-------------------------------+-----------------+------------+---------------------+-------------+--------------+----------+--------+----------------
 17075 | dvdrental | 16192 |            |       10 | postgres | psql             | ::1         |                 |       54107 | 2024-09-08 10:06:15.641832+09 | 2024-09-08 10:06:17.728863+09 | 2024-09-08 10:06:17.728863+09 | 2024-09-08 10:06:17.729389+09 | Client          | ClientRead | idle in transaction |             |              |          | BEGIN; | client backend
(1 行)

dvdrental=# SELECT
dvdrental-#     pid,
dvdrental-#     usename,
dvdrental-#     state,
dvdrental-#     query,
dvdrental-#     age(clock_timestamp(), query_start) AS idle_duration,
dvdrental-#     client_addr
dvdrental-# FROM
dvdrental-#     pg_stat_activity
dvdrental-# WHERE
dvdrental-#     state = 'idle in transaction'
dvdrental-#     AND age(clock_timestamp(), query_start) > interval '5 minutes'; -- Adjust the interval as needed
  pid  | usename  |        state        | query  |  idle_duration  | client_addr
-------+----------+---------------------+--------+-----------------+-------------
 16192 | postgres | idle in transaction | BEGIN; | 00:05:59.077614 | ::1
(1 行)
```

* index_analysis_and_bloat_estimate.sql

未使用のインデックスを見つけるクエリ
```sql
dvdrental=# -- http://www.databasesoup.com/2014/05/new-finding-unused-indexes-query.html
dvdrental=# -- I use this for bloat estimate on indexes as well
dvdrental=# WITH btree_index_atts AS (
dvdrental(#     SELECT nspname, relname, reltuples, relpages, indrelid, relam,
dvdrental(#         regexp_split_to_table(indkey::text, ' ')::smallint AS attnum,
dvdrental(#         indexrelid as index_oid
dvdrental(#     FROM pg_index
dvdrental(#     JOIN pg_class ON pg_class.oid=pg_index.indexrelid
dvdrental(#     JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
dvdrental(#     JOIN pg_am ON pg_class.relam = pg_am.oid
dvdrental(#     WHERE pg_am.amname = 'btree'
dvdrental(#     ),
dvdrental-# index_item_sizes AS (
dvdrental(#     SELECT
dvdrental(#     i.nspname, i.relname, i.reltuples, i.relpages, i.relam,
dvdrental(#     s.starelid, a.attrelid AS table_oid, index_oid,
dvdrental(#     current_setting('block_size')::numeric AS bs,
dvdrental(#     /* MAXALIGN: 4 on 32bits, 8 on 64bits (and mingw32 ?) */
dvdrental(#     CASE
dvdrental(#         WHEN version() ~ 'mingw32' OR version() ~ '64-bit' THEN 8
dvdrental(#         ELSE 4
dvdrental(#     END AS maxalign,
dvdrental(#     24 AS pagehdr,
dvdrental(#     /* per tuple header: add index_attribute_bm if some cols are null-able */
dvdrental(#     CASE WHEN max(coalesce(s.stanullfrac,0)) = 0
dvdrental(#         THEN 2
dvdrental(#         ELSE 6
dvdrental(#     END AS index_tuple_hdr,
dvdrental(#     /* data len: we remove null values save space using it fractionnal part from stats */
dvdrental(#     sum( (1-coalesce(s.stanullfrac, 0)) * coalesce(s.stawidth, 2048) ) AS nulldatawidth
dvdrental(#     FROM pg_attribute AS a
dvdrental(#     JOIN pg_statistic AS s ON s.starelid=a.attrelid AND s.staattnum = a.attnum
dvdrental(#     JOIN btree_index_atts AS i ON i.indrelid = a.attrelid AND a.attnum = i.attnum
dvdrental(#     WHERE a.attnum > 0
dvdrental(#     GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
dvdrental(# ),
dvdrental-# index_aligned AS (
dvdrental(#     SELECT maxalign, bs, nspname, relname AS index_name, reltuples,
dvdrental(#         relpages, relam, table_oid, index_oid,
dvdrental(#       ( 2 +
dvdrental(#           maxalign - CASE /* Add padding to the index tuple header to align on MAXALIGN */
dvdrental(#             WHEN index_tuple_hdr%maxalign = 0 THEN maxalign
dvdrental(#             ELSE index_tuple_hdr%maxalign
dvdrental(#           END
dvdrental(#         + nulldatawidth + maxalign - CASE /* Add padding to the data to align on MAXALIGN */
dvdrental(#             WHEN nulldatawidth::integer%maxalign = 0 THEN maxalign
dvdrental(#             ELSE nulldatawidth::integer%maxalign
dvdrental(#           END
dvdrental(#       )::numeric AS nulldatahdrwidth, pagehdr
dvdrental(#     FROM index_item_sizes AS s1
dvdrental(# ),
dvdrental-# otta_calc AS (
dvdrental(#   SELECT bs, nspname, table_oid, index_oid, index_name, relpages, coalesce(
dvdrental(#     ceil((reltuples*(4+nulldatahdrwidth))/(bs-pagehdr::float)) +
dvdrental(#       CASE WHEN am.amname IN ('hash','btree') THEN 1 ELSE 0 END , 0 -- btree and hash have a metadata reserved block
dvdrental(#     ) AS otta
dvdrental(#   FROM index_aligned AS s2
dvdrental(#     LEFT JOIN pg_am am ON s2.relam = am.oid
dvdrental(# ),
dvdrental-# raw_bloat AS (
dvdrental(#     SELECT current_database() as dbname, nspname, c.relname AS table_name, index_name,
dvdrental(#         bs*(sub.relpages)::bigint AS totalbytes,
dvdrental(#         CASE
dvdrental(#             WHEN sub.relpages <= otta THEN 0
dvdrental(#             ELSE bs*(sub.relpages-otta)::bigint END
dvdrental(#             AS wastedbytes,
dvdrental(#         CASE
dvdrental(#             WHEN sub.relpages <= otta
dvdrental(#             THEN 0 ELSE bs*(sub.relpages-otta)::bigint * 100 / (bs*(sub.relpages)::bigint) END
dvdrental(#             AS realbloat,
dvdrental(#         pg_relation_size(sub.table_oid) as table_bytes,
dvdrental(#         stat.idx_scan as index_scans
dvdrental(#     FROM otta_calc AS sub
dvdrental(#     JOIN pg_class AS c ON c.oid=sub.table_oid
dvdrental(#     JOIN pg_stat_user_indexes AS stat ON sub.index_oid = stat.indexrelid
dvdrental(# )
dvdrental-# SELECT dbname as database_name, nspname as schema_name, table_name, index_name,
dvdrental-#         round(realbloat, 1) as bloat_pct,
dvdrental-#         wastedbytes as bloat_bytes, pg_size_pretty(wastedbytes::bigint) as bloat_size,
dvdrental-#         totalbytes as index_bytes, pg_size_pretty(totalbytes::bigint) as index_size,
dvdrental-#         table_bytes, pg_size_pretty(table_bytes) as table_size,
dvdrental-#         index_scans
dvdrental-# FROM raw_bloat
dvdrental-# -- Filter it down a bit this way:
dvdrental-# --WHERE ( realbloat > 50 and wastedbytes > 50000000 )
dvdrental-# ORDER BY wastedbytes DESC
dvdrental-# LIMIT 10; -- Remove this limit if wanting more rows
 database_name | schema_name |  table_name   |                     index_name                      | bloat_pct | bloat_bytes | bloat_size | index_bytes | index_size | table_bytes | table_size | index_scans
---------------+-------------+---------------+-----------------------------------------------------+-----------+-------------+------------+-------------+------------+-------------+------------+-------------
 dvdrental     | public      | rental        | idx_unq_rental_rental_date_inventory_id_customer_id |      12.5 |       65536 | 64 kB      |      524288 | 512 kB     |     1228800 | 1200 kB    |           0
 dvdrental     | public      | payment       | idx_fk_rental_id                                    |      11.9 |       40960 | 40 kB      |      344064 | 336 kB     |      884736 | 864 kB     |           0
 dvdrental     | public      | rental        | rental_pkey                                         |      10.9 |       40960 | 40 kB      |      376832 | 368 kB     |     1228800 | 1200 kB    |           0
 dvdrental     | public      | payment       | payment_pkey                                        |      11.9 |       40960 | 40 kB      |      344064 | 336 kB     |      884736 | 864 kB     |           0
 dvdrental     | public      | film_actor    | film_actor_pkey                                     |      11.8 |       16384 | 16 kB      |      139264 | 136 kB     |      245760 | 240 kB     |           0
 dvdrental     | public      | film          | idx_title                                           |      28.6 |       16384 | 16 kB      |       57344 | 56 kB      |      442368 | 432 kB     |           0
 dvdrental     | public      | inventory     | inventory_pkey                                      |      13.3 |       16384 | 16 kB      |      122880 | 120 kB     |      204800 | 200 kB     |           0
 dvdrental     | public      | film_category | film_category_pkey                                  |      20.0 |        8192 | 8192 bytes |       40960 | 40 kB      |       49152 | 48 kB      |           0
 dvdrental     | public      | city          | city_pkey                                           |      25.0 |        8192 | 8192 bytes |       32768 | 32 kB      |       40960 | 40 kB      |           0
 dvdrental     | public      | customer      | customer_pkey                                       |      25.0 |        8192 | 8192 bytes |       32768 | 32 kB      |       73728 | 72 kB      |           0
(10 行)
```

* index_size_usage_stats.sql

各テーブルの行数、インデックス、およびそれらのインデックスに関する情報を取得します

```sql
dvdrental=# -- https://wiki.postgresql.org/wiki/Index_Maintenance
dvdrental=# SELECT
dvdrental-#     t.schemaname,
dvdrental-#     t.tablename,
dvdrental-#     c.reltuples::bigint                            AS num_rows,
dvdrental-#     pg_size_pretty(pg_relation_size(c.oid))        AS table_size,
dvdrental-#     psai.indexrelname                              AS index_name,
dvdrental-#     pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
dvdrental-#     CASE WHEN i.indisunique THEN 'Y' ELSE 'N' END  AS "unique",
dvdrental-#     psai.idx_scan                                  AS number_of_scans,
dvdrental-#     psai.idx_tup_read                              AS tuples_read,
dvdrental-#     psai.idx_tup_fetch                             AS tuples_fetched
dvdrental-# FROM
dvdrental-#     pg_tables t
dvdrental-#     LEFT JOIN pg_class c ON t.tablename = c.relname
dvdrental-#     LEFT JOIN pg_index i ON c.oid = i.indrelid
dvdrental-#     LEFT JOIN pg_stat_all_indexes psai ON i.indexrelid = psai.indexrelid
dvdrental-# WHERE
dvdrental-#     t.schemaname NOT IN ('pg_catalog', 'information_schema')
dvdrental-# ORDER BY 1, 2;
 schemaname |   tablename   | num_rows | table_size |                     index_name                      | index_size | unique | number_of_scans | tuples_read | tuples_fetched
------------+---------------+----------+------------+-----------------------------------------------------+------------+--------+-----------------+-------------+----------------
 public     | actor         |      200 | 16 kB      | actor_pkey                                          | 16 kB      | Y      |               0 |           0 |              0
 public     | actor         |      200 | 16 kB      | idx_actor_last_name                                 | 16 kB      | N      |               0 |           0 |              0
 public     | address       |      603 | 64 kB      | idx_fk_city_id                                      | 32 kB      | N      |               0 |           0 |              0
 public     | address       |      603 | 64 kB      | address_pkey                                        | 32 kB      | Y      |               4 |           4 |              4
 public     | category      |       16 | 8192 bytes | category_pkey                                       | 16 kB      | Y      |               0 |           0 |              0
 public     | city          |      600 | 40 kB      | idx_fk_country_id                                   | 16 kB      | N      |               0 |           0 |              0
 public     | city          |      600 | 40 kB      | city_pkey                                           | 32 kB      | Y      |               0 |           0 |              0
 public     | country       |      109 | 8192 bytes | country_pkey                                        | 16 kB      | Y      |               0 |           0 |              0
 public     | customer      |      599 | 72 kB      | idx_fk_address_id                                   | 32 kB      | N      |               0 |           0 |              0
 public     | customer      |      599 | 72 kB      | idx_last_name                                       | 32 kB      | N      |               0 |           0 |              0
 public     | customer      |      599 | 72 kB      | idx_fk_store_id                                     | 16 kB      | N      |               0 |           0 |              0
 public     | customer      |      599 | 72 kB      | customer_pkey                                       | 32 kB      | Y      |               0 |           0 |              0
 public     | film          |     1000 | 432 kB     | film_fulltext_idx                                   | 88 kB      | N      |               0 |           0 |              0
 public     | film          |     1000 | 432 kB     | film_pkey                                           | 40 kB      | Y      |               0 |           0 |              0
 public     | film          |     1000 | 432 kB     | idx_title                                           | 56 kB      | N      |               0 |           0 |              0
 public     | film          |     1000 | 432 kB     | idx_fk_language_id                                  | 16 kB      | N      |               0 |           0 |              0
 public     | film_actor    |     5462 | 240 kB     | film_actor_pkey                                     | 136 kB     | Y      |               0 |           0 |              0
 public     | film_actor    |     5462 | 240 kB     | idx_fk_film_id                                      | 80 kB      | N      |               0 |           0 |              0
 public     | film_category |     1000 | 48 kB      | film_category_pkey                                  | 40 kB      | Y      |               0 |           0 |              0
 public     | inventory     |     4581 | 200 kB     | idx_store_id_film_id                                | 88 kB      | N      |               0 |           0 |              0
 public     | inventory     |     4581 | 200 kB     | inventory_pkey                                      | 120 kB     | Y      |               0 |           0 |              0
 public     | language      |        6 | 8192 bytes | language_pkey                                       | 16 kB      | Y      |               0 |           0 |              0
 public     | payment       |    14596 | 864 kB     | idx_fk_staff_id                                     | 120 kB     | N      |               1 |       14596 |          14596
 public     | payment       |    14596 | 864 kB     | payment_pkey                                        | 336 kB     | Y      |               0 |           0 |              0
 public     | payment       |    14596 | 864 kB     | idx_fk_rental_id                                    | 336 kB     | N      |               0 |           0 |              0
 public     | payment       |    14596 | 864 kB     | idx_fk_customer_id                                  | 128 kB     | N      |               0 |           0 |              0
 public     | rental        |    16044 | 1200 kB    | idx_unq_rental_rental_date_inventory_id_customer_id | 512 kB     | Y      |               0 |           0 |              0
 public     | rental        |    16044 | 1200 kB    | idx_fk_inventory_id                                 | 240 kB     | N      |               0 |           0 |              0
 public     | rental        |    16044 | 1200 kB    | rental_pkey                                         | 368 kB     | Y      |               0 |           0 |              0
 public     | staff         |        2 | 8192 bytes | staff_pkey                                          | 16 kB      | Y      |               1 |           2 |              2
 public     | store         |        2 | 8192 bytes | idx_unq_manager_staff_id                            | 16 kB      | Y      |               0 |           0 |              0
 public     | store         |        2 | 8192 bytes | store_pkey                                          | 16 kB      | Y      |               0 |           0 |              0
(32 行)
```
* insert_only_pg_stat_user_tables.sql

テーブル操作別に行数を取得します

```sql
dvdrental=# -- check number of inserts, updates, deletes for a table
dvdrental=# SELECT
dvdrental-#   relname,
dvdrental-#   n_tup_ins,
dvdrental-#   n_tup_upd,
dvdrental-#   n_tup_del
dvdrental-# FROM pg_stat_user_tables
dvdrental-# WHERE relname = 'actor';
 relname | n_tup_ins | n_tup_upd | n_tup_del
---------+-----------+-----------+-----------
 actor   |       200 |         0 |         0
(1 行)
```

続き

https://master--pea-sys-blog.netlify.app/posts/20240908/