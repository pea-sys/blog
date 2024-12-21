---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'MySQLのバグレポート'
pubDate: 2024-12-11
description: 'MySQLのバグレポート'
tags: ["MySQL","DB"]
---

MySQLのバグレポートはOracleのバグレポートページで行います。

去年、MySQLの復習がてら公式ドキュメントの機能を全てハンズオンで試しました(検証が面倒な機能はスキップ)。
その際、1つのドキュメント脱字と2つのプログラムの問題をチケット化しました。

きちんと対応していただけてるようで先日１つのチケットが修正プログラムのリリースと共に閉じられました。

備忘録としてチケット発行手順を簡単に記載します。

* https://dev.mysql.com/ にアクセスします

* ページ右上からOracleアカウントを登録し、ログインします

<img src="https://github.com/user-attachments/assets/dcffee15-08dd-4919-8ae7-11df75668e72"  width="600">

* `DEVELOPER ZONE`タブを選択後`Bugs`タブを選択するとチケット管理ページが表示されます

<img src="https://github.com/user-attachments/assets/88243f38-e0cf-4670-8485-0660b41063c3" width="600">

* あとは、バグレポートページのガイドラインに従って、バグを報告します

<img src="https://github.com/user-attachments/assets/fd3845e4-abb2-4a08-bc6a-107ed373f85c" width="600">

以上