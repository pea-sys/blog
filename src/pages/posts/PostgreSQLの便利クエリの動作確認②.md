---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'PostgreSQLの便利クエリの動作確認②'
pubDate: 2024-09-08
description: 'PostgreSQL'
tags: ["PostgreSQL"]
---

この記事は前回の続きです。

https://master--pea-sys-blog.netlify.app/posts/20240907/

* last_tables_autovacuumed.sql

最後にバキュームした日時を取得します
```sql
dvdrental=# SELECT relname, last_vacuum, last_autovacuum FROM pg_stat_user_tables where last_autovacuum is not null order by last_autovacuum DESC limit 10;
  relname   | last_vacuum |        last_autovacuum
------------+-------------+-------------------------------
 payment    |             | 2024-09-08 09:02:25.86786+09
 rental     |             | 2024-09-08 09:02:25.805211+09
 inventory  |             | 2024-09-08 09:02:25.765327+09
 film_actor |             | 2024-09-08 09:02:25.746413+09
(4 行)
```

* list_10_largest_tables.sql

サイズの大きいテーブルトップ10を取得します
```sql
dvdrental=# -- https://dataedo.com/kb/query/postgresql/list-10-largest-tables
dvdrental=# -- List 10 largest tables
dvdrental=# SELECT
dvdrental-#   schemaname AS table_schema,
dvdrental-#   relname AS table_name,
dvdrental-#   pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
dvdrental-#   pg_size_pretty(pg_relation_size(relid)) AS data_size,
dvdrental-#   pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS external_size
dvdrental-# FROM pg_catalog.pg_statio_user_tables
dvdrental-# ORDER BY
dvdrental-#   pg_total_relation_size(relid) DESC,
dvdrental-#   pg_relation_size(relid) DESC
dvdrental-# LIMIT 10;
 table_schema |  table_name   | total_size | data_size | external_size
--------------+---------------+------------+-----------+---------------
 public       | rental        | 2320 kB    | 1200 kB   | 1120 kB
 public       | payment       | 1784 kB    | 864 kB    | 920 kB
 public       | film          | 640 kB     | 432 kB    | 208 kB
 public       | film_actor    | 456 kB     | 240 kB    | 216 kB
 public       | inventory     | 408 kB     | 200 kB    | 208 kB
 public       | customer      | 184 kB     | 72 kB     | 112 kB
 public       | address       | 128 kB     | 64 kB     | 64 kB
 public       | film_category | 88 kB      | 48 kB     | 40 kB
 public       | city          | 88 kB      | 40 kB     | 48 kB
 public       | actor         | 48 kB      | 16 kB     | 32 kB
(10 行)
```

* list_10_worst_queries.sql

※postgresql.confの設定でpg_stat_statementsをロードする設定に変更します
```
shared_preload_libraries = 'pg_stat_statements'
```
有効化した後は統計情報収集のため、少し時間が必要です  
有効かどうかは下記で確認できます
```sql
dvdrental=# SELECT * FROM pg_available_extensions WHERE name = 'pg_stat_statements';
        name        | default_version | installed_version |                                comment
--------------------+-----------------+-------------------+------------------------------------------------------------------------
 pg_stat_statements | 1.10            | 1.10              | track planning and execution statistics of all SQL statements executed

dvdrental=# SHOW shared_preload_libraries;
 shared_preload_libraries
--------------------------
 pg_stat_statements
(1 行)


dvdrental=# SHOW pg_stat_statements.track;
 pg_stat_statements.track
--------------------------
 all
(1 行)
```

```sql
dvdrental=# -- from crunchy data
dvdrental=# SELECT
dvdrental-#     total_exec_time,
dvdrental-#     mean_exec_time AS avg_ms,
dvdrental-#     calls,
dvdrental-#     query
dvdrental-# FROM
dvdrental-#     pg_stat_statements
dvdrental-# ORDER BY
dvdrental-#     mean_exec_time DESC
dvdrental-# LIMIT 10;
 total_exec_time |       avg_ms       | calls |                                                         query

-----------------+--------------------+-------+-----------------------------------------------------------------------------------------------------------------------
        602.8544 |           602.8544 |     1 | CREATE DATABASE dvdrental
        932.6098 |           466.3049 |     2 | WITH RECURSIVE tables AS (
                 +
                 |                    |       |   SELECT
                 +
                 |                    |       |     c.oid AS parent,
                 +
                 |                    |       |     c.oid AS relid,
                 +
                 |                    |       |     $1     AS level
                 +
                 |                    |       |   FROM pg_catalog.pg_class c
                 +
                 |                    |       |   LEFT JOIN pg_catalog.pg_inherits AS i ON c.oid = i.inhrelid
                 +
                 |                    |       |     -- p = partitioned table, r = normal table
                 +
                 |                    |       |   WHERE c.relkind IN ($2, $3)
                 +
                 |                    |       |     -- not having a parent table -> we only get the partition heads
                 +
                 |                    |       |     AND i.inhrelid IS NULL
                 +
                 |                    |       |   UNION ALL
                 +
                 |                    |       |   SELECT
                 +
                 |                    |       |     p.parent         AS parent,
                 +
                 |                    |       |     c.oid            AS relid,
                 +
                 |                    |       |     p.level + $4      AS level
                 +
                 |                    |       |   FROM tables AS p
                 +
                 |                    |       |   LEFT JOIN pg_catalog.pg_inherits AS i ON p.relid = i.inhparent
                 +
                 |                    |       |   LEFT JOIN pg_catalog.pg_class AS c ON c.oid = i.inhrelid AND c.relispartition
                 +
                 |                    |       |   WHERE c.oid IS NOT NULL
                 +
                 |                    |       | )
                 +
                 |                    |       | SELECT
                 +
                 |                    |       |   parent ::REGCLASS                                  AS table_name,
                 +
                 |                    |       |   array_agg(relid :: REGCLASS)                       AS all_partitions,
                 +
                 |                    |       |   pg_size_pretty(sum(pg_total_relation_size(relid))) AS pretty_total_size,
                 +
                 |                    |       |   sum(pg_total_relation_size(relid))                 AS total_size
                 +
                 |                    |       | FROM tables
                 +
                 |                    |       | GROUP BY parent
                 +
                 |                    |       | ORDER BY sum(pg_total_relation_size(relid)) DESC
         832.171 | 277.39033333333333 |     3 | analyze
        182.7388 |           182.7388 |     1 | CREATE OR REPLACE FUNCTION random_between(low INT ,high INT)
                 +
                 |                    |       |    RETURNS INT AS
                 +
                 |                    |       | $$
                 +
                 |                    |       | BEGIN
                 +
                 |                    |       |    RETURN floor(random()* (high-low + 1) + low);
                 +
                 |                    |       | END;
                 +
                 |                    |       | $$ language 'plpgsql' STRICT
          129.16 |             129.16 |     1 | COPY public.rental (rental_id, rental_date, inventory_id, customer_id, return_date, staff_id, last_update) FROM stdin
        117.6916 |           117.6916 |     1 | drop database dvdrental
         73.3024 |            73.3024 |     1 | CREATE EXTENSION pg_stat_statements
        144.3616 |            72.1808 |     2 | SELECT * FROM pg_available_extensions WHERE name = $1
         67.2588 |            67.2588 |     1 | COPY public.payment (payment_id, customer_id, staff_id, rental_id, amount, payment_date) FROM stdin
        114.2782 |            57.1391 |     2 | SELECT tbl.table_schema,
                 +
                 |                    |       |        tbl.table_name
                 +
                 |                    |       | FROM information_schema.tables tbl
                 +
                 |                    |       | WHERE table_type = $1
                 +
                 |                    |       | AND table_schema NOT IN ($2, $3)
                 +
                 |                    |       | AND NOT EXISTS (SELECT $4
                 +
                 |                    |       |                 FROM information_schema.key_column_usage kcu
                 +
                 |                    |       |                 WHERE kcu.table_name = tbl.table_name
                 +
                 |                    |       |                   AND kcu.table_schema = tbl.table_schema)
(10 行)
```

* list_all_sequences_column_owner.sql

シーケンスをもつテーブルと列を取得します  
※・・・これ今でも機能するのか不明

```sql
-- https://stackoverflow.com/a/6945493
SELECT
  s.relname AS seq,
  n.nspname AS sch,
  t.relname AS tab,
  a.attname AS col 
FROM
  pg_class s 
JOIN pg_depend d ON d.objid = s.oid 
AND d.classid = 'pg_class'::regclass 
AND d.refclassid = 'pg_class'::regclass 
JOIN pg_class t ON t.oid = d.refobjid 
JOIN pg_namespace n ON n.oid = t.relnamespace 
JOIN pg_attribute a ON a.attrelid = t.oid 
AND a.attnum = d.refobjsubid 
WHERE
  s.relkind = 'S' 
  AND d.deptype = 'a';
```


* list_collations.sql

照合の一覧を取得します  
※ソート順序とか決めるやつ

```sql
dvdrental=# -- https://www.cybertec-postgresql.com/en/case-insensitive-pattern-matching-in-postgresql/
dvdrental=# -- https://database.guide/how-to-return-a-list-of-available-collations-in-postgresql/
dvdrental=# SELECT * FROM pg_collation WHERE collname like '%en_US%';
  oid  |        collname        | collnamespace | collowner | collprovider | collisdeterministic | collencoding | collcollate | collctype |  colliculocale   | collicurules |  collversion
-------+------------------------+---------------+-----------+--------------+---------------------+--------------+-------------+-----------+------------------+--------------+---------------
 12572 | en-US-x-icu            |            11 |        10 | i            | t                   |           -1 |             |           | en-US            |              | 153.14
 12573 | en-US-u-va-posix-x-icu |            11 |        10 | i            | t                   |           -1 |             |           | en-US-u-va-posix |              | 153.14.37
 13580 | en-US                  |            11 |        10 | c            | t                   |           24 | en-US       | en-US     |
         |              | 1540.3,1540.3
 13581 | en_US                  |            11 |        10 | c            | t                   |           24 | en-US       | en-US     |
         |              | 1540.3,1540.3
(4 行)
```

* list_comments.sql

カラムとコメントの一覧を取得します
```sql
dvdrental=# -- https://stackoverflow.com/a/4946306
dvdrental=# SELECT
dvdrental-#   c.table_schema,
dvdrental-#   c.table_name,
dvdrental-#   c.column_name,
dvdrental-#   pgd.description
dvdrental-# FROM
dvdrental-#   pg_catalog.pg_statio_all_tables AS st
dvdrental-# INNER JOIN
dvdrental-#   pg_catalog.pg_description pgd
dvdrental-#   ON ( pgd.objoid = st.relid )
dvdrental-# INNER JOIN
dvdrental-#   information_schema.columns c
dvdrental-#   ON ( pgd.objsubid = c.ordinal_position
dvdrental(#   AND c.table_schema = st.schemaname
dvdrental(#   AND c.table_name = st.relname );
 table_schema | table_name | column_name | description
--------------+------------+-------------+-------------
 public       | actor      | first_name  | 名前
 public       | actor      | last_name   | 苗字
(2 行)
```
* list_db_views.sql

ビュー一覧を取得します
```sql
dvdrental=# -- https://dba.stackexchange.com/a/23837
dvdrental=# select table_name from INFORMATION_SCHEMA.views WHERE table_schema = ANY (current_schemas(false));
         table_name
----------------------------
 actor_info
 customer_list
 film_list
 nicer_but_slower_film_list
 sales_by_film_category
 sales_by_store
 staff_list
(7 行)
```

* list_enums.sql

列挙体一覧を取得します

```sql
dvdrental=# -- https://guides.rubyonrails.org/active_record_postgresql.html#enumerated-types
dvdrental=# SELECT n.nspname AS enum_schema,
dvdrental-#        t.typname AS enum_name,
dvdrental-#        e.enumlabel AS enum_value
dvdrental-# FROM pg_type t
dvdrental-#     JOIN pg_enum e ON t.oid = e.enumtypid
dvdrental-#     JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace;
 enum_schema |  enum_name  | enum_value
-------------+-------------+------------
 public      | mpaa_rating | G
 public      | mpaa_rating | PG
 public      | mpaa_rating | PG-13
 public      | mpaa_rating | R
 public      | mpaa_rating | NC-17
(5 行)
```

* list_indexes.sql

インデックス一覧を取得します
```sql
dvdrental=# SELECT
dvdrental-#     tablename,
dvdrental-#     indexname,
dvdrental-#     indexdef
dvdrental-# FROM
dvdrental-#     pg_indexes
dvdrental-# WHERE
dvdrental-#     schemaname = 'public'
dvdrental-# ORDER BY
dvdrental-#     tablename,
dvdrental-#     indexname;
   tablename   |                      indexname                      |                                                                   indexdef

---------------+-----------------------------------------------------+-----------------------------------------------------------------------------------------------------------------------------------------------
 actor         | actor_pkey                                          | CREATE UNIQUE INDEX actor_pkey ON public.actor USING btree (actor_id)
 actor         | idx_actor_last_name                                 | CREATE INDEX idx_actor_last_name ON public.actor USING btree (last_name)
 address       | address_pkey                                        | CREATE UNIQUE INDEX address_pkey ON public.address USING btree (address_id)
 address       | idx_fk_city_id                                      | CREATE INDEX idx_fk_city_id ON public.address USING btree (city_id)
 category      | category_pkey                                       | CREATE UNIQUE INDEX category_pkey ON public.category USING btree (category_id)
 city          | city_pkey                                           | CREATE UNIQUE INDEX city_pkey ON public.city USING btree (city_id)
 city          | idx_fk_country_id                                   | CREATE INDEX idx_fk_country_id ON public.city USING btree (country_id)
 country       | country_pkey                                        | CREATE UNIQUE INDEX country_pkey ON public.country USING btree (country_id)
 customer      | customer_pkey                                       | CREATE UNIQUE INDEX customer_pkey ON public.customer USING btree (customer_id)
 customer      | idx_fk_address_id                                   | CREATE INDEX idx_fk_address_id ON public.customer USING btree (address_id)
 customer      | idx_fk_store_id                                     | CREATE INDEX idx_fk_store_id ON public.customer USING btree (store_id)
 customer      | idx_last_name                                       | CREATE INDEX idx_last_name ON public.customer USING btree (last_name)
 film          | film_fulltext_idx                                   | CREATE INDEX film_fulltext_idx ON public.film USING gist (fulltext)
 film          | film_pkey                                           | CREATE UNIQUE INDEX film_pkey ON public.film USING btree (film_id)
 film          | idx_fk_language_id                                  | CREATE INDEX idx_fk_language_id ON public.film USING btree (language_id)
 film          | idx_title                                           | CREATE INDEX idx_title ON public.film USING btree (title)
 film_actor    | film_actor_pkey                                     | CREATE UNIQUE INDEX film_actor_pkey ON public.film_actor USING btree (actor_id, film_id)
 film_actor    | idx_fk_film_id                                      | CREATE INDEX idx_fk_film_id ON public.film_actor USING btree (film_id)
 film_category | film_category_pkey                                  | CREATE UNIQUE INDEX film_category_pkey ON public.film_category USING btree (film_id, category_id)
 inventory     | idx_store_id_film_id                                | CREATE INDEX idx_store_id_film_id ON public.inventory USING btree (store_id, film_id)
 inventory     | inventory_pkey                                      | CREATE UNIQUE INDEX inventory_pkey ON public.inventory USING btree (inventory_id)
 language      | language_pkey                                       | CREATE UNIQUE INDEX language_pkey ON public.language USING btree (language_id)
 my_table      | my_table_pkey                                       | CREATE UNIQUE INDEX my_table_pkey ON public.my_table USING btree (id)
 payment       | idx_fk_customer_id                                  | CREATE INDEX idx_fk_customer_id ON public.payment USING btree (customer_id)
 payment       | idx_fk_rental_id                                    | CREATE INDEX idx_fk_rental_id ON public.payment USING btree (rental_id)
 payment       | idx_fk_staff_id                                     | CREATE INDEX idx_fk_staff_id ON public.payment USING btree (staff_id)
 payment       | payment_pkey                                        | CREATE UNIQUE INDEX payment_pkey ON public.payment USING btree (payment_id)
 rental        | idx_fk_inventory_id                                 | CREATE INDEX idx_fk_inventory_id ON public.rental USING btree (inventory_id)
 rental        | idx_unq_rental_rental_date_inventory_id_customer_id | CREATE UNIQUE INDEX idx_unq_rental_rental_date_inventory_id_customer_id ON public.rental USING btree (rental_date, inventory_id, customer_id)
 rental        | rental_pkey                                         | CREATE UNIQUE INDEX rental_pkey ON public.rental USING btree (rental_id)
 staff         | staff_pkey                                          | CREATE UNIQUE INDEX staff_pkey ON public.staff USING btree (staff_id)
 store         | idx_unq_manager_staff_id                            | CREATE UNIQUE INDEX idx_unq_manager_staff_id ON public.store USING btree (manager_staff_id)
 store         | store_pkey                                          | CREATE UNIQUE INDEX store_pkey ON public.store USING btree (store_id)
(33 行)
```

* list_partitioned_tables.sql

テーブル一覧とその種別を出力します

```sql
dvdrental=# --
dvdrental=# -- https://stackoverflow.com/a/58243669
dvdrental=# -- r = ordinary table, i = index, S = sequence, t = TOAST table, v = view,
dvdrental=# -- m = materialized view, c = composite type, f = foreign table,
dvdrental=# -- p = partitioned table, I = partitioned index
dvdrental=# --
dvdrental=# SELECT n.nspname AS "Schema"
dvdrental-#      , c.relname AS "Name"
dvdrental-#      , CASE c.relkind
dvdrental-#          WHEN 'p' THEN 'partitioned table'
dvdrental-#          WHEN 'r' THEN 'ordinary table'
dvdrental-#          -- more types?
dvdrental-#          ELSE 'unknown table type'
dvdrental-#        END AS "Type"
dvdrental-#      , pg_catalog.pg_get_userbyid(c.relowner) AS "Owner"
dvdrental-# FROM   pg_catalog.pg_class c
dvdrental-# JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace
dvdrental-# WHERE  c.relkind = ANY ('{p,r,""}') -- add more types?
dvdrental-# AND    NOT c.relispartition         -- exclude child partitions
dvdrental-# AND    n.nspname !~ ALL ('{^pg_,^information_schema$}') -- exclude system schemas
dvdrental-# ORDER  BY 1, 2;
 Schema |     Name      |      Type      |  Owner
--------+---------------+----------------+----------
 public | actor         | ordinary table | postgres
 public | address       | ordinary table | postgres
 public | category      | ordinary table | postgres
 public | city          | ordinary table | postgres
 public | country       | ordinary table | postgres
 public | customer      | ordinary table | postgres
 public | film          | ordinary table | postgres
 public | film_actor    | ordinary table | postgres
 public | film_category | ordinary table | postgres
 public | inventory     | ordinary table | postgres
 public | language      | ordinary table | postgres
 public | my_table      | ordinary table | postgres
 public | payment       | ordinary table | postgres
 public | rental        | ordinary table | postgres
 public | staff         | ordinary table | postgres
 public | store         | ordinary table | postgres
(16 行)
```

* list_schemata.sql

スキーマ一覧を取得します
```sql
dvdrental=# -- https://soft-builder.com/how-to-list-all-schemas-in-postgresql/
dvdrental=# SELECT schema_name
dvdrental-# FROM information_schema.schemata;
    schema_name
--------------------
 public
 information_schema
 pg_catalog
 pg_toast
(4 行)
```

* list_single_column_multicolumn_index_counts.sql

テーブルに張っているシングルインデックスとマルチインデックスの数を取得します

```sql
dvdrental=# -- https://wiki.postgresql.org/wiki/Index_Maintenance
dvdrental=# SELECT
dvdrental-#     pg_class.relname,
dvdrental-#     COUNT(*) FILTER ( WHERE indnatts = 1 )                AS single_column_indexes,
dvdrental-#     COUNT(*) FILTER ( WHERE indnatts IS DISTINCT FROM 1 ) AS multi_column_indexes
dvdrental-# FROM
dvdrental-#     pg_namespace
dvdrental-#     LEFT JOIN pg_class ON pg_namespace.oid = pg_class.relnamespace
dvdrental-#     LEFT JOIN pg_index ON pg_class.oid = pg_index.indrelid
dvdrental-# WHERE
dvdrental-#     pg_namespace.nspname = 'public' AND
dvdrental-#     pg_class.relkind = 'r'
dvdrental-# GROUP BY pg_class.relname, pg_class.reltuples
dvdrental-# ORDER BY pg_class.reltuples DESC;
    relname    | single_column_indexes | multi_column_indexes
---------------+-----------------------+----------------------
 rental        |                     2 |                    1
 payment       |                     4 |                    0
 film_actor    |                     1 |                    1
 inventory     |                     1 |                    1
 film          |                     4 |                    0
 film_category |                     0 |                    1
 address       |                     2 |                    0
 city          |                     2 |                    0
 customer      |                     4 |                    0
 actor         |                     2 |                    0
 country       |                     1 |                    0
 category      |                     1 |                    0
 language      |                     1 |                    0
 staff         |                     1 |                    0
 store         |                     2 |                    0
 my_table      |                     1 |                    0
(16 行)
```

* list_table_object_dependencies.sql

指定したテーブルに依存するオブジェクトを取得します
```sql
dvdrental=# -- Credit: https://stackoverflow.com/a/11773226/126688
dvdrental=# SELECT dependent_ns.nspname as dependent_schema
dvdrental-# , dependent_view.relname as dependent_view
dvdrental-# , source_ns.nspname as source_schema
dvdrental-# , source_table.relname as source_table
dvdrental-# , pg_attribute.attname as column_name
dvdrental-# FROM pg_depend
dvdrental-# JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
dvdrental-# JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid
dvdrental-# JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid
dvdrental-# JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
dvdrental-#     AND pg_depend.refobjsubid = pg_attribute.attnum
dvdrental-#     JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
dvdrental-#     JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
dvdrental-#     WHERE
dvdrental-#     source_ns.nspname = 'public' -- yourschema
dvdrental-#     AND source_table.relname = 'actor' --yourtable
dvdrental-#     AND pg_attribute.attnum > 0
dvdrental-#     --AND pg_attribute.attname = 'my_column'
dvdrental-#     ORDER BY 1,2;
 dependent_schema |       dependent_view       | source_schema | source_table | column_name
------------------+----------------------------+---------------+--------------+-------------
 public           | actor_info                 | public        | actor        | first_name
 public           | actor_info                 | public        | actor        | actor_id
 public           | actor_info                 | public        | actor        | last_name
 public           | film_list                  | public        | actor        | first_name
 public           | film_list                  | public        | actor        | actor_id
 public           | film_list                  | public        | actor        | last_name
 public           | nicer_but_slower_film_list | public        | actor        | actor_id
 public           | nicer_but_slower_film_list | public        | actor        | last_name
 public           | nicer_but_slower_film_list | public        | actor        | first_name
(9 行)
```

* list_tables_without_primary_key.sql

主キーのないテーブル一覧を取得します
```sql
dvdrental=# CREATE TABLE test(name text);
CREATE TABLE

dvdrental=# -- https://dba.stackexchange.com/a/29933
dvdrental=# SELECT tbl.table_schema,
dvdrental-#        tbl.table_name
dvdrental-# FROM information_schema.tables tbl
dvdrental-# WHERE table_type = 'BASE TABLE'
dvdrental-# AND table_schema NOT IN ('pg_catalog', 'information_schema')
dvdrental-# AND NOT EXISTS (SELECT 1
dvdrental(#                 FROM information_schema.key_column_usage kcu
dvdrental(#                 WHERE kcu.table_name = tbl.table_name
dvdrental(#                   AND kcu.table_schema = tbl.table_schema);
 table_schema | table_name
--------------+------------
 public       | test
(1 行)
```

* lock_blocking_waiting_pg_locks.sql

ロック解除待ちのクエリを取得します
```sql


dvdrental=# SELECT
dvdrental-#     blocked_locks.pid AS blocked_pid,
dvdrental-#     blocked_activity.usename AS blocked_user,
dvdrental-#     blocking_locks.pid AS blocking_pid,
dvdrental-#     blocking_activity.usename AS blocking_user,
dvdrental-#     blocked_activity.query AS blocked_query,
dvdrental-#     blocking_activity.query AS blocking_query,
dvdrental-#     blocked_activity.query_start AS blocked_query_start,
dvdrental-#     blocking_activity.query_start AS blocking_query_start
dvdrental-# FROM pg_catalog.pg_locks blocked_locks
dvdrental-# JOIN pg_catalog.pg_stat_activity blocked_activity
dvdrental-#     ON blocked_activity.pid = blocked_locks.pid
dvdrental-# JOIN pg_catalog.pg_locks blocking_locks
dvdrental-#     ON blocking_locks.locktype = blocked_locks.locktype
dvdrental-#     AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
dvdrental-#     AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
dvdrental-#     AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
dvdrental-#     AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
dvdrental-#     AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
dvdrental-#     AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
dvdrental-#     AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
dvdrental-#     AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
dvdrental-#     AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
dvdrental-#     AND blocking_locks.pid != blocked_locks.pid
dvdrental-# JOIN pg_catalog.pg_stat_activity blocking_activity
dvdrental-#     ON blocking_activity.pid = blocking_locks.pid
dvdrental-# WHERE NOT blocked_locks.granted;
 blocked_pid | blocked_user | blocking_pid | blocking_user |    blocked_query    |  blocking_query  |      blocked_query_start      |     blocking_query_start
-------------+--------------+--------------+---------------+---------------------+------------------+-------------------------------+-------------------------------
        8244 | postgres     |        11168 | postgres      | select * from test; | lock table test; | 2024-09-08 15:02:35.449485+09 | 2024-09-08 15:01:32.304951+09
(1 行)
```

* per_table_options_reloptions_all_regular_tables.sql

通常のテーブル一覧とオプションを取得します

```sql
dvdrental=# ALTER TABLE test SET (autovacuum_vacuum_scale_factor = 0.01);
ALTER TABLE
dvdrental=# SELECT
dvdrental-#     nspname AS schema_name,
dvdrental-#     relname AS table_name,
dvdrental-#     option_name,
dvdrental-#     option_value
dvdrental-# FROM
dvdrental-#     pg_class c
dvdrental-# JOIN
dvdrental-#     pg_namespace n ON n.oid = c.relnamespace
dvdrental-# LEFT JOIN
dvdrental-#     LATERAL pg_options_to_table(reloptions) AS opts(option_name, option_value) ON true
dvdrental-# WHERE
dvdrental-#     relkind = 'r' -- Only list options for regular tables
dvdrental-#     AND nspname NOT IN ('pg_catalog', 'information_schema') -- Exclude system tables
dvdrental-# ORDER BY
dvdrental-#     nspname,
dvdrental-#     relname;
 schema_name |  table_name   |          option_name           | option_value
-------------+---------------+--------------------------------+--------------
 public      | actor         |                                |
 public      | address       |                                |
 public      | category      |                                |
 public      | city          |                                |
 public      | country       |                                |
 public      | customer      |                                |
 public      | film          |                                |
 public      | film_actor    |                                |
 public      | film_category |                                |
 public      | inventory     |                                |
 public      | language      |                                |
 public      | my_table      |                                |
 public      | payment       |                                |
 public      | rental        |                                |
 public      | staff         |                                |
 public      | store         |                                |
 public      | test          | autovacuum_vacuum_scale_factor | 0.01
(17 行)
```

* percent_not_null.sql

特定のカラムのNULL割合を取得します

```sql
dvdrental=# SELECT
dvdrental-#    count(1) as TotalAll,
dvdrental-#    count("address2") as TotalNotNull,
dvdrental-#    count(1) - count("address2") as TotalNull,
dvdrental-#    100.0 * count("address2") / count(1) as PercentNotNull
dvdrental-# FROM
dvdrental-#    address;
 totalall | totalnotnull | totalnull |   percentnotnull
----------+--------------+-----------+---------------------
      603 |          599 |         4 | 99.3366500829187396
(1 行)
```

* pg_stat_activity_pg_locks.sql

現在実行中のクエリと、それに関連するロック情報を取得します

```sql
dvdrental=# SELECT
dvdrental-#     psa.pid,
dvdrental-#     psa.datname,
dvdrental-#     psa.usename,
dvdrental-#     psa.query,
dvdrental-#     psa.query_start,
dvdrental-#     pl.locktype,
dvdrental-#     pl.mode,
dvdrental-#     pl.granted,
dvdrental-#     pl.relation::regclass AS relation_name,
dvdrental-#     pl.transactionid,
dvdrental-#     pl.virtualtransaction,
dvdrental-#     pl.virtualxid,
dvdrental-#     pl.pid AS locked_by
dvdrental-# FROM
dvdrental-#     pg_stat_activity psa
dvdrental-#     JOIN pg_locks pl ON psa.pid = pl.pid
dvdrental-# ORDER BY
dvdrental-#     psa.query_start ASC;
 pid  |  datname  | usename  |                    query                    |          query_start          |  locktype  |      mode       | granted |       relation_name       | transactionid | virtualtransaction | virtualxid | locked_by
------+-----------+----------+---------------------------------------------+-------------------------------+------------+-----------------+---------+---------------------------+---------------+--------------------+------------+-----------
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | relation   | AccessShareLock | t       | pg_locks                  |               | 3/235              |            |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | relation   | AccessShareLock | t       | pg_stat_activity          |               | 3/235              |            |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | virtualxid | ExclusiveLock   | t       |                           |               | 3/235              | 3/235      |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | relation   | AccessShareLock | t       | pg_authid_oid_index       |               | 3/235              |            |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | relation   | AccessShareLock | t       | pg_authid_rolname_index   |               | 3/235              |            |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | relation   | AccessShareLock | t       | pg_database_oid_index     |               | 3/235              |            |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | relation   | AccessShareLock | t       | pg_database_datname_index |               | 3/235              |            |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | relation   | AccessShareLock | t       | pg_database               |               | 3/235              |            |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
 2212 | dvdrental | postgres | SELECT                                     +| 2024-09-08 15:16:24.095491+09 | relation   | AccessShareLock | t       | pg_authid                 |               | 3/235              |            |      2212
      |           |          |     psa.pid,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.datname,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.usename,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query,                             +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start,                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.locktype,                           +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.mode,                               +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.granted,                            +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.relation::regclass AS relation_name,+|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.transactionid,                      +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualtransaction,                 +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.virtualxid,                         +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pl.pid AS locked_by                    +|                               |            |                 |
|                           |               |                    |            |
      |           |          | FROM                                       +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     pg_stat_activity psa                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     JOIN pg_locks pl ON psa.pid = pl.pid   +|                               |            |                 |
|                           |               |                    |            |
      |           |          | ORDER BY                                   +|                               |            |                 |
|                           |               |                    |            |
      |           |          |     psa.query_start ASC;                    |                               |            |                 |
|                           |               |                    |            |
(9 行)
```

* pg_stat_database.sql

DBに対する統計情報を取得します

```sql
dvdrental=# select * from pg_stat_database where datname = 'dvdrental';
 datid |  datname  | numbackends | xact_commit | xact_rollback | blks_read | blks_hit | tup_returned | tup_fetched | tup_inserted | tup_updated | tup_deleted | conflicts | temp_files | temp_bytes | deadlocks | checksum_failures | checksum_last_failure | blk_read_time | blk_write_time | session_time | active_time | idle_in_transaction_time | sessions | sessions_abandoned | sessions_fatal | sessions_killed | stats_reset
-------+-----------+-------------+-------------+---------------+-----------+----------+--------------+-------------+--------------+-------------+-------------+-----------+------------+------------+-----------+-------------------+-----------------------+---------------+----------------+--------------+-------------+--------------------------+----------+--------------------+----------------+-----------------+-------------
 17884 | dvdrental |           2 |        1278 |            19 |      1905 |   111548 |       696859 |       70294 |        46339 |        1682 |          70 |         0 |          0 |          0 |         0 |                   |                       |             0 |              0 | 28919603.638 |    3261.792 |                113544.21 |       14 |                  6 |              0 |               1 |
(1 行)

```


```sql
dvdrental=# GRANT SELECT ON TABLE test TO postgres;
GRANT
dvdrental-#     'GRANT ' || array_to_string(array_agg(privilege_type), ', ') || ' ON TABLE ' || table_name || ' TO ' || grantee || ';' AS grant_statement
dvdrental-# FROM (
dvdrental(#     SELECT
dvdrental(#         grantee,
dvdrental(#         table_name,
dvdrental(#         privilege_type
dvdrental(#     FROM
dvdrental(#         information_schema.role_table_grants
dvdrental(#     WHERE
dvdrental(#         table_name = 'test'
dvdrental(# ) AS privileges
dvdrental-# GROUP BY
dvdrental-#     grantee, table_name;
                                        grant_statement
------------------------------------------------------------------------------------------------
 GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON TABLE test TO postgres;
(1 行)
```

* relation_size.sql

テーブルサイズを取得します

```sql
dvdrental=# -- size for table or index
dvdrental=# SELECT pg_size_pretty(pg_total_relation_size ('actor'));
 pg_size_pretty
----------------
 72 kB
(1 行)


dvdrental=#
dvdrental=#
dvdrental=# -- Table name, row count, human readable size
dvdrental=# -- Meant for the rideshare sample database
dvdrental=# -- and the "actor" table
dvdrental=# SELECT
dvdrental-#     relname AS table_name,
dvdrental-#     n_live_tup AS row_count,
dvdrental-#     pg_size_pretty(pg_total_relation_size(relid)) AS total_size
dvdrental-# FROM
dvdrental-#     pg_stat_user_tables
dvdrental-# WHERE
dvdrental-#   relname IN ('actor')
dvdrental-# ORDER BY
dvdrental-#     total_size DESC;
 table_name | row_count | total_size
------------+-----------+------------
 actor      |       200 | 72 kB
(1 行)
```

* relation_size_extended.sql

すべてのテーブルとパーティション化されたテーブルを合算したサイズを取得します
```sql
dvdrental=# WITH RECURSIVE tables AS (
dvdrental(#   SELECT
dvdrental(#     c.oid AS parent,
dvdrental(#     c.oid AS relid,
dvdrental(#     1     AS level
dvdrental(#   FROM pg_catalog.pg_class c
dvdrental(#   LEFT JOIN pg_catalog.pg_inherits AS i ON c.oid = i.inhrelid
dvdrental(#     -- p = partitioned table, r = normal table
dvdrental(#   WHERE c.relkind IN ('p', 'r')
dvdrental(#     -- not having a parent table -> we only get the partition heads
dvdrental(#     AND i.inhrelid IS NULL
dvdrental(#   UNION ALL
dvdrental(#   SELECT
dvdrental(#     p.parent         AS parent,
dvdrental(#     c.oid            AS relid,
dvdrental(#     p.level + 1      AS level
dvdrental(#   FROM tables AS p
dvdrental(#   LEFT JOIN pg_catalog.pg_inherits AS i ON p.relid = i.inhparent
dvdrental(#   LEFT JOIN pg_catalog.pg_class AS c ON c.oid = i.inhrelid AND c.relispartition
dvdrental(#   WHERE c.oid IS NOT NULL
dvdrental(# )
dvdrental-# SELECT
dvdrental-#   parent ::REGCLASS                                  AS table_name,
dvdrental-#   array_agg(relid :: REGCLASS)                       AS all_partitions,
dvdrental-#   pg_size_pretty(sum(pg_total_relation_size(relid))) AS pretty_total_size,
dvdrental-#   sum(pg_total_relation_size(relid))                 AS total_size
dvdrental-# FROM tables
dvdrental-# GROUP BY parent
dvdrental-# ORDER BY sum(pg_total_relation_size(relid)) DESC;
                 table_name                 |                all_partitions                | pretty_total_size | total_size
--------------------------------------------+----------------------------------------------+-------------------+------------
 rental                                     | {rental}                                     | 2352 kB           |    2408448
 payment                                    | {payment}                                    | 1816 kB           |    1859584
 pg_proc                                    | {pg_proc}                                    | 1224 kB           |    1253376
 film                                       | {film}                                       | 936 kB            |     958464
 pg_attribute                               | {pg_attribute}                               | 792 kB            |     811008
 pg_rewrite                                 | {pg_rewrite}                                 | 768 kB            |     786432
 pg_statistic                               | {pg_statistic}                               | 664 kB            |     679936
 pg_description                             | {pg_description}                             | 616 kB            |     630784
 pg_collation                               | {pg_collation}                               | 584 kB            |     598016
 film_actor                                 | {film_actor}                                 | 488 kB            |     499712
 inventory                                  | {inventory}                                  | 440 kB            |     450560
 pg_depend                                  | {pg_depend}                                  | 336 kB            |     344064
 pg_type                                    | {pg_type}                                    | 248 kB            |     253952
 pg_operator                                | {pg_operator}                                | 232 kB            |     237568
 pg_class                                   | {pg_class}                                   | 232 kB            |     237568
 pg_amop                                    | {pg_amop}                                    | 224 kB            |     229376
 customer                                   | {customer}                                   | 208 kB            |     212992
 address                                    | {address}                                    | 152 kB            |     155648
 pg_constraint                              | {pg_constraint}                              | 152 kB            |     155648
 pg_amproc                                  | {pg_amproc}                                  | 144 kB            |     147456
 film_category                              | {film_category}                              | 112 kB            |     114688
 city                                       | {city}                                       | 112 kB            |     114688
 information_schema.sql_features            | {information_schema.sql_features}            | 104 kB            |     106496
 pg_index                                   | {pg_index}                                   | 104 kB            |     106496
 pg_conversion                              | {pg_conversion}                              | 96 kB             |      98304
 pg_trigger                                 | {pg_trigger}                                 | 96 kB             |      98304
 pg_opclass                                 | {pg_opclass}                                 | 88 kB             |      90112
 pg_ts_config_map                           | {pg_ts_config_map}                           | 88 kB             |      90112
 pg_init_privs                              | {pg_init_privs}                              | 80 kB             |      81920
 pg_cast                                    | {pg_cast}                                    | 80 kB             |      81920
 pg_attrdef                                 | {pg_attrdef}                                 | 80 kB             |      81920
 pg_namespace                               | {pg_namespace}                               | 80 kB             |      81920
 pg_extension                               | {pg_extension}                               | 80 kB             |      81920
 pg_opfamily                                | {pg_opfamily}                                | 80 kB             |      81920
 pg_ts_dict                                 | {pg_ts_dict}                                 | 80 kB             |      81920
 pg_language                                | {pg_language}                                | 80 kB             |      81920
 pg_range                                   | {pg_range}                                   | 72 kB             |      73728
 pg_auth_members                            | {pg_auth_members}                            | 72 kB             |      73728
 pg_ts_parser                               | {pg_ts_parser}                               | 72 kB             |      73728
 pg_ts_template                             | {pg_ts_template}                             | 72 kB             |      73728
 pg_am                                      | {pg_am}                                      | 72 kB             |      73728
 pg_ts_config                               | {pg_ts_config}                               | 72 kB             |      73728
 pg_aggregate                               | {pg_aggregate}                               | 72 kB             |      73728
 actor                                      | {actor}                                      | 72 kB             |      73728
 pg_enum                                    | {pg_enum}                                    | 56 kB             |      57344
 information_schema.sql_sizing              | {information_schema.sql_sizing}              | 48 kB             |      49152
 pg_tablespace                              | {pg_tablespace}                              | 48 kB             |      49152
 pg_authid                                  | {pg_authid}                                  | 48 kB             |      49152
 pg_database                                | {pg_database}                                | 48 kB             |      49152
 information_schema.sql_implementation_info | {information_schema.sql_implementation_info} | 48 kB             |      49152
 information_schema.sql_parts               | {information_schema.sql_parts}               | 48 kB             |      49152
 store                                      | {store}                                      | 40 kB             |      40960
 pg_shdescription                           | {pg_shdescription}                           | 32 kB             |      32768
 pg_statistic_ext                           | {pg_statistic_ext}                           | 32 kB             |      32768
 pg_publication_rel                         | {pg_publication_rel}                         | 32 kB             |      32768
 staff                                      | {staff}                                      | 32 kB             |      32768
 pg_policy                                  | {pg_policy}                                  | 24 kB             |      24576
 pg_foreign_data_wrapper                    | {pg_foreign_data_wrapper}                    | 24 kB             |      24576
 category                                   | {category}                                   | 24 kB             |      24576
 pg_event_trigger                           | {pg_event_trigger}                           | 24 kB             |      24576
 pg_sequence                                | {pg_sequence}                                | 24 kB             |      24576
 pg_replication_origin                      | {pg_replication_origin}                      | 24 kB             |      24576
 pg_user_mapping                            | {pg_user_mapping}                            | 24 kB             |      24576
 pg_default_acl                             | {pg_default_acl}                             | 24 kB             |      24576
 country                                    | {country}                                    | 24 kB             |      24576
 pg_parameter_acl                           | {pg_parameter_acl}                           | 24 kB             |      24576
 pg_foreign_server                          | {pg_foreign_server}                          | 24 kB             |      24576
 language                                   | {language}                                   | 24 kB             |      24576
 pg_subscription                            | {pg_subscription}                            | 24 kB             |      24576
 pg_db_role_setting                         | {pg_db_role_setting}                         | 16 kB             |      16384
 pg_shdepend                                | {pg_shdepend}                                | 16 kB             |      16384
 pg_publication_namespace                   | {pg_publication_namespace}                   | 16 kB             |      16384
 my_table                                   | {my_table}                                   | 16 kB             |      16384
 pg_publication                             | {pg_publication}                             | 16 kB             |      16384
 pg_partitioned_table                       | {pg_partitioned_table}                       | 16 kB             |      16384
 pg_transform                               | {pg_transform}                               | 16 kB             |      16384
 pg_seclabel                                | {pg_seclabel}                                | 16 kB             |      16384
 pg_foreign_table                           | {pg_foreign_table}                           | 16 kB             |      16384
 pg_inherits                                | {pg_inherits}                                | 16 kB             |      16384
 pg_shseclabel                              | {pg_shseclabel}                              | 16 kB             |      16384
 pg_statistic_ext_data                      | {pg_statistic_ext_data}                      | 16 kB             |      16384
 test                                       | {test}                                       | 8192 bytes        |       8192
 pg_largeobject                             | {pg_largeobject}                             | 8192 bytes        |       8192
 pg_subscription_rel                        | {pg_subscription_rel}                        | 8192 bytes        |       8192
 pg_largeobject_metadata                    | {pg_largeobject_metadata}                    | 8192 bytes        |       8192
(85 行)
```

続き

https://master--pea-sys-blog.netlify.app/posts/20240909/