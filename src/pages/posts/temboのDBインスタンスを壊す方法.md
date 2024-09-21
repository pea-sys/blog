---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'temboのDBインスタンスを壊す方法'
pubDate: 2024-09-15
description: 'PostgreSQL'
tags: ["PostgreSQL","ManagedService"]
---

temboというPostgreSQLのマネージドサービスがあります。

https://tembo.io/

今回は、DBインスタンスを作成し、復旧不可能な状態にする方法を記載します。

DBインスタンス作成までの手順は特に迷うことはないと思うので割愛します。  

サイドバーの歯車アイコンを選択し、Postgresタブを選択します。

<img src="https://images.prismic.io/peasysblog/ZuYvBLVsGrYSvXyy_tembo1.png?auto=format,compress" width="600">

ページ一番下までスクロールし、`ADD Configuration`の項目で`ADD NEW`ボタンを押します。

<img src="https://images.prismic.io/peasysblog/ZuYvCLVsGrYSvXyz_tembo2.png?auto=format,compress" width="600">

存在しない設定を追加します。

<img src="https://images.prismic.io/peasysblog/ZuYvCbVsGrYSvXy0_tembo3.png?auto=format,compress" width="600">

その後、インスタンスを再起動すると、ずっと再起動中のステータスのままになります。

<img src="https://images.prismic.io/peasysblog/ZuYvC7VsGrYSvXy1_tembo4.png?auto=format,compress" width="600">

本記事公開時点ではユーザーに許されているリカバリー方法は、運営に問い合わせ以外なさそうです。  

