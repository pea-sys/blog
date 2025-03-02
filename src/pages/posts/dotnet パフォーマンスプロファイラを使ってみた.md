---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'dotnet パフォーマンスプロファイラを使ってみた'
pubDate: 2024-10-25
description: ''
tags: ["VisualStudio"]
---

VisualStudioにパフォーマンスプロファイラなるものを見つけたので使い方を
確認してみました


![1](https://github.com/user-attachments/assets/176a1634-c29b-4a4f-a946-eb1ef9f26972)

学ぶより慣れろということで、取り合えず使い始めてみます

フレームワークのバージョンや種類によって使用できるツールに差異があるようです

触ってみた感想としては、これだけ様々な情報が得られれば、これらのツールで概ねパフォーマンスに関する問題は解決できそうだと感じました

昔は、WinDbgを使ったり、外部ツールで情報収集していましたが、
そういったツールももう必要なく、VisualStudio同梱のパフォーマンスツールで事足りるという印象です



## .NET Async
非同期及び待機の使用状況を調べるツール

* テストコード
```c#
using System.Net.NetworkInformation;

int failed = 0;
var tasks = new List<Task>();
String[] urls = { "www.adatum.com", "www.cohovineyard.com",
                        "www.cohowinery.com", "www.northwindtraders.com",
                        "www.contoso.com" };

foreach (var value in urls)
{
    var url = value;
    tasks.Add(Task.Run(() => {
        var png = new Ping();
        try
        {
            var reply = png.Send(url);
            if (!(reply.Status == IPStatus.Success))
            {
                Interlocked.Increment(ref failed);
                throw new TimeoutException("Unable to reach " + url + ".");
            }
        }
        catch (PingException)
        {
            Interlocked.Increment(ref failed);
            throw;
        }
    }));
}
Task t = Task.WhenAll(tasks);
try
{
    t.Wait();
}
catch { }

if (t.Status == TaskStatus.RanToCompletion)
    Console.WriteLine("All ping attempts succeeded.");
else if (t.Status == TaskStatus.Faulted)
    Console.WriteLine("{0} ping attempts failed", failed);

await Task.Delay(2000);
```


タスクの数や実行時間が指定期間内で確認できる  
また、タスクを実行した関数にジャンプすることもできる

|名前|カウント|開始時間 \(ミリ秒\)|終了時間 \(ミリ秒\)|合計時間 \(ミリ秒\)|
|-|-|-|-|-|
| + Task.WhenAll|1|2,129.52|3,361.90|1,232.38|
|\| + Program.Main.AnonymousMethod\_\_0\(\)|5|2,126.81|3,361.90|589.49\(平均\)|
|\|\| + \[詳細\]|5|2,126.81|3,361.90|589.49\(平均\)|
|\|\|\| - 標準分散内に 4 行|4|2,126.81|3,361.90|568.69\(平均\)|
|\|\|\| - \[タスク\]Program.Main.AnonymousMethod\_\_0\(\)|1|2,689.20|3,361.90|672.70|
| + Program.Main\(\)|1|3,396.67|5,407.86|2,011.19|
|\| + Task.Delay|1|3,383.97|5,409.15|2,025.18|


## .NET カウンター

 EventCounter API または Meter API を使用して公開されたパフォーマンス カウンターの値を監視できます。

 使用しているライブラリによりカウンターが変化します。
　
 パフォーマンス調査の入口で最も使いそうな機能です。

 ![2](https://github.com/user-attachments/assets/565e4aea-0bc9-4298-8cee-c38dfecb5e4b)

 ![3](https://github.com/user-attachments/assets/9a8a6fe7-e3be-4d66-9e96-317245b1a076)


 ## イベントビューワ
 汎用イベント ビューアーには、モジュールの読み込み、スレッドの開始、システムの構成などのイベントの一覧を使用して、アプリのアクティビティが表示されます。


 中身はかなりコアな内容が多岐に渡り記録されていました。  
 今の私には使いこなすのは難しそう。    
 不具合の手がかりが得られない場合に、イベントビューワから探っていくといった使い方はできるかもしれません。  
 ログ量が多いので基本的にフィルターして使うものだと思います。
 ![4](https://github.com/user-attachments/assets/7b593b28-5871-40df-a13f-839034a994fa)


 ## データべース

データベース クエリを記録します。 その後、個々のクエリに関する情報を分析して、アプリのパフォーマンスを向上させるための場所を見つけることができます。

スロークエリをログできないようなシンプルなDBの場合には便利だと思います。
ADO.NET または Entity Framework Core を使った場合に測定されます。

|開始時刻 \(秒\)|クエリ|期間 \(ミリ秒\)|影響を受けたレコード|読み取ったレコード|
|-|-|-|-|-|
| - 5.817|INSERT INTO "Blogs" \("Url"\)VALUES \(\@p0\)RETURNING "BlogId";|49.599|1|1|
| - 7.059|SELECT "b"."BlogId", "b"."Url" FROM "Blogs" AS "b" ORDER BY "b"."BlogId" LIMIT 1|3.905|0|2|
| + 7.124|TransactionCommitted|56.610|2|2|
|\| - 7.131|UPDATE "Blogs" SET "Url" = \@p0 WHERE "BlogId" = \@p1 RETURNING 1;|5.076|1|1|
|\| - 7.141|INSERT INTO "Posts" \("BlogId", "Content", "Title"\) VALUES \(\@p0, \@p1, \@p2\) RETURNING "PostId";|4.981|1|1|
| + 7.202|TransactionCommitted|7.490|2|2|
|\| - 7.203|DELETE FROM "Posts" WHERE "PostId" = \@p0 RETURNING 1;|1.369|1|1|
|\| - 7.205|DELETE FROM "Blogs" WHERE "BlogId" = \@p0 RETURNING 1;|0.444|1|1|


## メモリ使用量
アプリのメモリ使用量を監視します。

コードは個々のものを使用しました。
https://github.com/dotnet/samples/tree/main/core/diagnostics/DiagnosticScenarios

![5](https://github.com/user-attachments/assets/e2ba7241-b0b0-48f9-bec3-db8c9fbc70b5)

スナップショットを取ると、マネージドオブジェクトの数やメモリ使用量が確認できます

![6](https://github.com/user-attachments/assets/6d9271dd-acec-4956-abb0-8871609d1e83)

## .NETオブジェクト割り当て追跡
マネージドオブジェクトの割り当てと解放を追跡します

* 割り当てタブ

どのオブジェクトがどれ位割り当てられたか確認できます
![7](https://github.com/user-attachments/assets/56e053ed-14ea-4cc0-954b-45581a9458f7)

* 関数タブ

どの関数でどのオブジェクトがどれ位割り当てられたか確認できます
![8](https://github.com/user-attachments/assets/cbc73573-e978-4e02-bc3d-675f1fc82af0)

* コレクションタブ  

どのオブジェクトが何回目のGCでどれ位解放されたか確認できます

![9](https://github.com/user-attachments/assets/6f51b7db-74c3-4d69-8665-1ff0f1c271eb)


## インストルメンテーション
関数が呼び出された正確な回数や時間が確認できます

どの関数がどれ位時間が掛かっているか確認できます
![10](https://github.com/user-attachments/assets/895579ce-f7de-4044-94fa-8a18b6a1e579)

関数の呼び出し回数が確認できます
![11](https://github.com/user-attachments/assets/31497816-321b-4570-b2ae-904c5b22b047)

呼び出し履歴も確認できます
![12](https://github.com/user-attachments/assets/53272643-1d2d-4018-baf9-797fbe59438a)

フレームグラフも確認できます
![13](https://github.com/user-attachments/assets/9846f245-6f33-4943-8ac6-5707d6845e03)


## ファイルI/O
ファイルI/Oの読み書き量や回数が確認できます

![13](https://github.com/user-attachments/assets/3858e30c-9055-48bd-80d5-97f7618912af)