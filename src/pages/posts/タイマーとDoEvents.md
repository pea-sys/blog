---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'フォームタイマーとDoEvents'
pubDate: 2024-12-28
description: ''
tags: ["C#","VB.NET"]
---

まず最初に「DoEventsは使うな」という意見は多数派であることを理解しており、私もそれには賛成の立場です。
その前提でDoEventsを使っているシステムに関わる現場で働いているため、問題点を記録しておきます。

UIスレッドで動くタイマーとDoEventsが組み合わさることで発生する予期しない動作を
レガシーシステムで何度も目にしています。

どういうことか、実際に例で動作確認してみます

DoEventsを使っているのは大体VB6からマイグレしたVB.NETが体感多いため、ここではVB.NETで記載しています。

[動作例]


```vb
Public Class Form1

    Private WithEvents timer As Timer = New Timer()
    Private loaded As Boolean = False
    Private Sub Button1_Click(sender As Object, e As EventArgs) Handles Button1.Click
        timer.Enabled = True

    End Sub

    Private Sub Form1_Load(sender As Object, e As EventArgs) Handles MyBase.Load
        If (loaded) Then Return
        loaded = True
        timer.Interval = 1000
        timer.Enabled = False
    End Sub

    Private Sub timer_Tick(sender As Object, e As EventArgs) Handles timer.Tick
        Debug.WriteLine("開始")
        System.Threading.Thread.Sleep(2000) '何らかの重い処理
        Application.DoEvents()
        Debug.WriteLine("終了")
    End Sub

End Class
```
このコードを実行すると次のような出力になります
```
開始
開始
開始
開始
開始
```
重い処理(2秒)＞タイマー発火間隔(1秒)　のため、一生Windowsメッセージキューを処理し続けます。

アプリが終了信号を受け取ると、溜まっていた終了処理が一気に処理されます
```
終了
終了
終了
終了
終了
終了
```
再入を考慮せず、グローバル変数を扱っていたり外部インターフェースと連携している場合に
このような事象が発生すると非常に怖いです。

### 根本原因
色々あると思いますが、DoEventsやWindowsメッセージキューに対する理解が浅いことだと思います。
規模が大きいシステムで乱用していると、もはや制御不可能です。


DoEventsの実装は次のコメントにある通り、全てのWindowsメッセージキューを処理します

```c#
        /// <include file='doc\Application.uex' path='docs/doc[@for="Application.DoEvents"]/*' />
        /// <devdoc>
        ///    <para>Processes
        ///       all Windows messages currently in the message queue.</para>
        /// </devdoc>
        public static void DoEvents() {
            ThreadContext.FromCurrent().RunMessageLoop(NativeMethods.MSOCM.msoloopDoEvents, null);
        }
```
フォームタイマーのソースを見るとウィンドウに送信されたメッセージを処理するコールバック関数である`WndProc`でWindowsメッセージを拾い、タイマー処理をしていることが分かります

https://referencesource.microsoft.com/#System.Windows.Forms/winforms/Managed/System/WinForms/Timer.cs,4b92b7b0c223376f,references

```C#
protected override void WndProc(ref Message m) {
 
                Debug.Assert(m.HWnd == Handle && Handle != IntPtr.Zero, "Timer getting messages for other windows?");
 
                // for timer messages, make sure they're ours (it'll be wierd if they aren't)
                // and call the timer event.
                //
                if (m.Msg == NativeMethods.WM_TIMER) {
                    //Debug.Assert((int)m.WParam == _timerID, "Why are we getting a timer message that isn't ours?");
                    if (unchecked( (int) (long)m.WParam) == _timerID) {
                        _owner.OnTick(EventArgs.Empty);
                        return;
                    }
                }
                else if (m.Msg == NativeMethods.WM_CLOSE) {
                    // this is a posted method from another thread that tells us we need
                    // to kill the timer.  The handle may already be gone, so we specify it here.
                    //
                    StopTimer(true, m.HWnd);                    
                    return;
                }   
                base.WndProc(ref m);
            }
```

つまり、DoEvents実行と同時にWindowsメッセージキューにたまった
タイマーメッセージは全て処理が開始されることになります

### 問題箇所の特定

巨大なシステムだと、このような問題を見つけるのは
中々大変なのでSpy++を使います。
Spy++はVisualStudioInstallerでC++コア機能からインストールできます。

![1](https://github.com/user-attachments/assets/2381659a-a330-4f03-9db2-5452f22becc1)

インストール後はVisualStudioのツールにリンクが作成されます。
ただし、このツールは32bitプロセス用。  
一見きちんと動くがメッセージがキャプチャされないのでハマりやすいです。
![2](https://github.com/user-attachments/assets/0d55246f-9802-4976-8800-d7befed583c4)

64bitプロセス用を使いたい場合、外部ツールとして別途登録しておくことをお勧めします。
![3](https://github.com/user-attachments/assets/cd612b41-6a86-4dce-9c44-931912484433)

※エラー検索が２つあるのはVisualStudio2022のバグっぽい


Spy++を起動したら次の作業を行います
* 双眼鏡アイコンをクリックする
* ファインダーツールの的を監視したいアプリにドラッグオンドロップする
* メッセージをチェックする
* OKを押す

![4](https://github.com/user-attachments/assets/4c219a5a-752a-462d-b83e-18d1e0620bac)

監視するメッセージの設定を行う  
今回はWM_TIMERメッセージのみを拾う設定にする
* メッセージタブからログオプションを選択する
* すべてクリアを選択後、WM_TIMERを追加する
* ウィンドウタブに移動し、同じプロセスウィンドウにチェックを入れる
* OKを押す

![5](https://github.com/user-attachments/assets/85a576c6-5e02-45c2-a5d1-60ee2974bf20)

![6](https://github.com/user-attachments/assets/260b816c-b9cd-47e4-b9ac-a128d5d45855)

これで目的のWindowsメッセージが確認できるようになった
![7](https://github.com/user-attachments/assets/03e046ef-6cb4-4644-94d3-b1d70953f32b)

### 対策方法
[1]と[2]は必須で対応し、他は可能な範囲で全てやるのが良さそうです  
[1]を行うことで再入による予期せぬ動作を防止します
[2]により、元々DoEventsを入れた動機である、UIスレッド制御をOSに返す時間を早めます


* [1]  再入を防ぐ。例えば、タイマー処理実行中フラグを用意したり、タイマー処理の入口でタイマーを止め、出口で動かす。この場合、タイマーのインターバルがタイマー処理終了後からの起算となる(※タイマーではなく独自のフラグで再入を防ぐ場合はスレッドセーフな方法をとる必要がある)

```VB
    Private Sub uiTimer_Tick(sender As Object, e As EventArgs) Handles uiTimer.Tick
        Try
            uiTimer.Enabled = False
            Debug.WriteLine("開始" + System.Threading.Thread.CurrentThread.ManagedThreadId.ToString())
            System.Threading.Thread.Sleep(2000)
            Application.DoEvents()
            Debug.WriteLine("終了" + System.Threading.Thread.CurrentThread.ManagedThreadId.ToString())
        Finally
            uiTimer.Enabled = True
        End Try
    End Sub
```
* [2] DoEventsを使わず、重い処理を非同期処理に切り出す
  とはいえ、非同期処理がタイマー発火より時間が掛かる場合、非同期処理が溜まり続けていき動作重くなりそう。ごくまれに遅い処理があるとかなら問題なし。
また許容できる程度の負荷で済むならあり。  

* [3] インターバルを必要最低限になるように見直す(不具合発生頻度を減らすだけで根本解決にならない場合も多い)
* [4] 重い処理を速くする(不具合発生頻度を減らすだけで根本解決にならない場合も多い)


### 補足
* フォームタイマー以外はWindowsメッセージキューを使用しません  
  DoEventsによる再入はありませんが、複数スレッドで同時実行される可能性はあります

* 非同期処理の使い分けメモ

|方法|メリット|デメリット|
|--|--|--|
|Thread|・各スレッドに優先順位を設定できる・スレッドの一時停止／再開／中断を行うことができる|・スレッドの作成と破棄を繰り返すとパフォーマンスが落ちる・ メソッドにパラメータを設定できない・ メソッドの戻り値を得るのが困難|
|ThreadPool|・ 効率よく複数のスレッドを実行できる・ object型のパラメータを1つだけ設定できる|・ メソッドの戻り値を得るのが困難・ 優先順位付けや待機、停止など、スレッドの細かな制御が難しい・同時に実行できるスレッドの数が制限されている|
|BeginInvoke|・ メソッドに型のあるパラメータを指定できる・ 簡単に戻り値を得ることができる|・ 優先順位付けや待機、停止など、スレッドの細かな制御が難しい・ 同時に実行できるスレッドの数が制限されている|
|Timer|・一定時間間隔でメソッドを実行することができる|・スレッドプールがいっぱいだとうまく動作しない|
|Task|・Timerのメリット以外のすべてを併せ持つ|・デメリットではないが短命処理向け|