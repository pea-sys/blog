---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'WinSxSフォルダサイズを削減'
pubDate: 2024-12-17
description: 'Windows11'
tags: ["Windows"]
---
仕事の都合でWindowsのファイルサイズ・ファイル数削減を検討する必要がある。
会社PCでいきなりやると怒られる可能性があるため、自宅PCでちょっと下調べ。  
Windows10または11をクリーンインストールした後、最もファイル数が多いのがWinSxSフォルダだった。

![base](https://github.com/user-attachments/assets/c156c620-0791-46ec-825c-3034f14aa088)

WinSxSフォルダはコンポーネントストアとも呼ばれ、様々なプログラムの格納場所になっている。

様々なプログラムが実際にはWinSxS内にハードリンクされている。
WinSxSフォルダは、Windowsエクスプローラーシェルがハードリンクを考慮する方法により、大きなディレクトリサイズが表示される。Windowsシェルは、ハード リンクへの各参照を、ファイルが存在するディレクトリごとにファイルの 1 つのインスタンスとしてカウントする。たとえば、advapi32.dll という名前のファイルが 700 KB で、コンポーネント ストアと \Windows\system32 ディレクトリに含まれている場合、Windows エクスプローラーは、ファイルが 1,400 KB のハード ディスク領域を消費していると誤って報告する。

なので、実際のサイズ測定は別の方法で行う必要がある。
```
C:\Users\masami>C:\Users\masami\Desktop\SysinternalsSuite\FindLinks.exe -nobanner "C:\Windows\System32\PING.EXE"
c:\windows\system32\ping.exe
        Index:  0x0005ABAF
        Links:  1

Linking file:
c:\Windows\WinSxS\amd64_microsoft-windows-ping-utilities_31bf3856ad364e35_10.0.22621.3085_none_894a35390b4a72df\PING.EXE
```
WinSxSフォルダ配下のTempフォルダもあるが、同様に安易に手動削除できるものではない。



こちらにある通り、WinSxSフォルダの詳細な情報をdismコマンドで得られる。

https://learn.microsoft.com/ja-jp/windows-hardware/manufacture/desktop/determine-the-actual-size-of-the-winsxs-folder?view=windows-11

```
Dism.exe /Online /Cleanup-Image /AnalyzeComponentStore

展開イメージのサービスと管理ツール
バージョン: 10.0.22621.2792

イメージのバージョン: 10.0.22621.4317

[==========================100.0%==========================]

コンポーネント ストア (WinSxS) 情報:

エクスプローラーによって検出されたコンポーネント ストアのサイズ : 11.24 GB

コンポーネント ストアの実際のサイズ : 11.04 GB

    Windows と共有 : 7.04 GB
    バックアップおよび無効な機能 : 3.99 GB
    キャッシュおよび一時的なデータ :  0 bytes

前回のクリーンアップ日 : 2024-12-05 18:59:10

再利用できるパッケージの数 : 2
コンポーネント ストアのクリーンアップを推奨 : はい

操作は正常に完了しました。
```

クリーンアップを推奨されているため、実行してみます

コマンドは下記を参照  

https://learn.microsoft.com/ja-jp/windows-hardware/manufacture/desktop/clean-up-the-winsxs-folder?view=windows-11

```
Dism.exe /online /Cleanup-Image /StartComponentCleanup

展開イメージのサービスと管理ツール
バージョン: 10.0.22621.2792

イメージのバージョン: 10.0.22621.4317

[=====                      10.0%                          ]
[==========================100.0%==========================]
操作は正常に完了しました。
```
1.5GB程度サイズが減った。

![cleanup](https://github.com/user-attachments/assets/e7197944-d78f-42a0-887f-eb404f41c957)

もう一度WinSxSフォルダの状況を確認
```
Dism.exe /Online /Cleanup-Image /AnalyzeComponentStore

展開イメージのサービスと管理ツール
バージョン: 10.0.22621.2792

イメージのバージョン: 10.0.22621.4317

[==========================100.0%==========================]

コンポーネント ストア (WinSxS) 情報:

エクスプローラーによって検出されたコンポーネント ストアのサイズ : 9.27 GB

コンポーネント ストアの実際のサイズ : 9.14 GB

    Windows と共有 : 7.03 GB
    バックアップおよび無効な機能 : 2.10 GB
    キャッシュおよび一時的なデータ :  0 bytes

前回のクリーンアップ日 : 2024-12-18 08:32:56

再利用できるパッケージの数 : 0
コンポーネント ストアのクリーンアップを推奨 : いいえ

操作は正常に完了しました。
```
主に、バックアップ及び無効な機能が削除されている模様

更にコンポーネント ストアの各コンポーネントの置き換え済みバージョンすべてを削除するコマンドを実行する  
もし、最新のコンポーネントに問題があった場合にロールバックできなくなるというデメリットはあるが、将来的な修正を待てるのであれば削除しても問題ないだろう
```
Dism.exe /online /Cleanup-Image /StartComponentCleanup /ResetBase

展開イメージのサービスと管理ツール
バージョン: 10.0.22621.2792

イメージのバージョン: 10.0.22621.4317

[=====                      10.0%                          ]
[==========================100.0%==========================]
操作は正常に完了しました。
```
ResetBaseはあまり減らなかった
```
Dism.exe /Online /Cleanup-Image /AnalyzeComponentStore

展開イメージのサービスと管理ツール
バージョン: 10.0.22621.2792

イメージのバージョン: 10.0.22621.4317

[===========================99.3%========================= ]

コンポーネント ストア (WinSxS) 情報:

エクスプローラーによって検出されたコンポーネント ストアのサイズ : 9.13 GB

コンポーネント ストアの実際のサイズ : 9.00 GB

    Windows と共有 : 7.03 GB
    バックアップおよび無効な機能 : 1.97 GB
    キャッシュおよび一時的なデータ :  0 bytes

前回のクリーンアップ日 : 2024-12-18 09:09:28

再利用できるパッケージの数 : 0
コンポーネント ストアのクリーンアップを推奨 : いいえ

操作は正常に完了しました。
```
最終的には、「コンポーネント ストアの実際のサイズ」より、2.04GB削減できた。


念のため、コンポーネントの有効・無効機能を確認したが特に問題なし
![func](https://github.com/user-attachments/assets/e39a52fb-d5dd-4497-b211-129cd3a8a6b5)