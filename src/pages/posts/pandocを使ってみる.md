---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'pandocを使ってみる'
pubDate: 2024-09-19
description: 'ツールの備忘録'
tags: ["tool"]
---

## 背景

仕事では仕様書は基本的にWordで作成していますが、やはり差分の確認が手間という欠点があります。  
あと、gitでバージョン管理しているため、リポジトリサイズも増えがちです。  

マークダウンファイルで仕様書を作成し、これを適時Wordに変換すれば、これらの課題は解決できます。リポジトリサイズもそこまで増えなくなるはずです。  
マークダウンファイルをwordに変換可能なpandocの存在は随分前から認識していたものの、ドキュメントの視認性はやっぱり、純粋にwordで作成したものには勝てないだろうということで敬遠していましたが、気まぐれで、ちょっと触ってみることにしました。  

## 準備


下記からインストーラをダウンロードしてインストールします

https://github.com/jgm/pandoc/releases/


----
~~PDFに変換するためには、PDFエンジンが別途必要なため、texliveもインストールします~~

~~https://www.tug.org/texlive/acquire-netinstall.html~~

※texliveはインストール開始から3時間以上たっても半分位しか進んでていないので、pdf化は本手法では諦めました。  


```
Installing [2188/4735, time/total: 03:44:52/08:41:12]: junicode [80728k]
Installing [2189/4735, time/total: 03:45:37/08:21:59]: junicodevf [4496k]
```

この時点で4GB位、ストレージを使用していました(デカイ)  
PDFにする手段は他にも色々あるので、そちらに頼ることにします。
  
----

## 動作確認

出力形式パラメータで私が使いそうなものは以下。

```
-t FORMAT, -w FORMAT, --to=FORMAT, --write=FORMAT
出力形式を指定してください。 FORMAT は以下の形式が選択できます。

docx (Word docx)

epub or epub3 (EPUB v3 電子書籍)

html または html5 (HTML, すなわち HTML5 および XHTML polyglot markup)

ipynb (Jupyter notebook)

pdf (PDF)

plain (プレーンテキスト)

pptx (PowerPoint slide show)

```


今回は、docx,htmlを確認します。


まずは、適当なマークダウンファイルを用意する。  

```
# A First Level Header

![logo](./Logo.png "logo"){ width=20% }

## A Second Level Header

Now is the time for all good men to come to
the aid of their country. This is just a
regular paragraph.

The quick brown fox jumped over the lazy
dog's back.

### Header 3

> This is a blockquote.
>
> This is the second paragraph in the blockquote.
>
> ## This is an H2 in a blockquote

Some of these words _are emphasized_.
Some of these words _are emphasized also_.

Use two asterisks for **strong emphasis**.
Or, if you prefer, **use two underscores instead**.

- Candy.
- Gum.
- Booze.

1.  Red
2.  Green
3.  Blue

- A list item.

  With multiple paragraphs.

- Another item in the list.

This is an [example link](http://example.com/).

```ruby
def hello
  puts "Hello, world!"
end
```

docxファイルの作成
```
pandoc "C:\Users\masami\Desktop\sample.md" -t docx -o sample.docx
```

<img src="https://images.prismic.io/peasysblog/ZuydR7VsGrYSvmoe_md2docx.png?auto=format,compress" width="800">

htmlファイルを作成

```
pandoc "C:\Users\masami\Desktop\sample.md" -t html -o sample.html --toc --highlight-style=zenburn
```

<img src="https://images.prismic.io/peasysblog/ZuydPLVsGrYSvmod_md2html.png?auto=format,compress" width="800">

## 感想

docxは良い出来で積極的に使いたいと思いました。  
画像のパス解決の方法が不明で、画像格納フォルダをカレントフォルダにすることで画像がうまいこと変換されるようになりました。
