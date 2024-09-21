---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'rack-mini-profilerメモ'
pubDate: 2024-09-21
description: 'RubyOnRails'
tags: ["RubyOnRails","Performance"]
---

こちらのツールに関するメモ

https://github.com/MiniProfiler/rack-mini-profiler

### フレームグラフ

フレームグラフを確認する方法


Genfileに次の行を追記
```
gem "rack-mini-profiler", require: false
```
インストールして、必要なファイルを作成
```sh
bundle install
rails g rack_profiler:install
```

URLの後ろに「?pp=flamegraph」を付加するとフレームグラフが確認できます。

<img src="https://images.prismic.io/peasysblog/Zu63yLVsGrYSvpXX_flamegraph.png?auto=format,compress" width="600">


### メモリープロファイラ
メモリープロファイラを確認する方法

Genfileに次の行を追記
```
gem 'memory_profiler'
```

インストールします
```sh
bundle install
```

URLの後ろに「?pp=profile-memory」を付加するとメモリープロファイラが確認できます。

<img src="https://images.prismic.io/peasysblog/Zu66HbVsGrYSvpXl_memoryprofiler.png?auto=format,compress" width="600">

同様にガベージコレクションの統計情報は「?pp=profile-gc」  
オブジェクトすページ情報は「?pp=analyze-memory」を付加します。


結果については、tmpフォルダ配下に保存されています
```
tmp/miniprofiler » ls
mp_timers_15kmk9t3x49iwxbbokdg  mp_timers_d4es0gkb79kkqvdirq    mp_timers_ozafxowpjzofb649uzto
mp_timers_1evvdl88eb0z72sy73h1  mp_timers_db3wx6yowtc4mmkrxc6j  mp_timers_ozhpv163m6mzyl96bz2n
・・・・
```