---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'Windowsエクスプローラで右クリックするとクラッシュする問題'
pubDate: 2024-11-13
description: 'Windows'
tags: ["Windows"]
---

## 事象
Windows10環境でエクスプローラに表示されるドライブを右クリックするとエクスプローラが落ちる。  
毎回発生するわけではなく、5回に1回程度。  
また、ウィルス対策ソフトを有効にしている時のみ発生する。他のフォルダは右クリックしても問題なし。


<img src="https://images.prismic.io/peasysblog/ZzSwE68jQArT0zaM_1.png?auto=format,compress" width="600">

## 原因
イベントログにライブラリ名が記録されていたことから、グラフィックドライバツールがきっかけでクラッシュしたことが分かった。
ウィルス対策ソフトとコンテキストメニュー表示時に参照されるグラフィックドライバツールの相性が悪いことにより、 
エクスプローラーがウィルス対策ソフトによりKillされていた。 

## 検証内容
* ウィルス対策ソフトが有効の状態で、再現テストを行い事象が再現した
* ウィルス対策ソフトが有効の状態で、再現テストを行い事象が再現しなかった(100回程度の試行)

## 対策
コンテキストメニューにベンダーライブラリのプログラムを非表示にした。　
レジストリの`HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers`から、該当のキーを探し、削除することで現象の再発はなくなった。

