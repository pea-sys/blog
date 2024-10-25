---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'JupyterNotebook を GitHubPages にデプロイする'
pubDate: 2024-10-25
description: ''
tags: ["Python","sandbox"]
---


JupyterLite を使用することで可能です。  
JupyterNoteBook を WASM 実装しているようです。  
GoogleColab の場合、Google アカウントが必要になりますが、JupyterLite はアカウントは不要です。

https://github.com/jupyterlite/jupyterlite

多くの Python ライブラリ（特にネイティブコードに依存するもの）は、まだ WebAssembly 上では動作しません。

## 手順

- 1. [デモページ](https://github.com/jupyterlite/demo)にアクセスし、「Use the template」から「Create a new Repository」を選択する

<img src="https://github.com/user-attachments/assets/30ea71ec-6ab3-418b-adca-bc60fa1e56b0" width="600">

- 2. デモリポジトリが自分のアカウントにフォークされるので、フォークしたリポジトリにアクセスする

※私の場合は次の URL

https://github.com/pea-sys/jupyterlite-demo

- 3. Settings タブ -> Actions -> General と選択し、ワークフロー権限を読み取りと書き込み権限に変更する

<img src="https://github.com/user-attachments/assets/c4536a47-0472-460e-b2a8-69936561fa8d" width="600">

- 4. Pages を選択し、Build and depoloyment を GitHub Actions に変更する

<img src="https://github.com/user-attachments/assets/356f714b-7768-442c-a996-9aef292ab7c3" width="600">

- 5.Actionst タブから initial Commit を選択し、Re-run-all jobs を実行する

<img src="https://github.com/user-attachments/assets/e6465c73-fcf1-471e-86af-e0f9a3f5a6ab" width="600">

- 6. 成功するとデプロイ先の URL が表示されるのでアクセスする

<img src="https://github.com/user-attachments/assets/5c892f3f-7d40-462c-932d-a9bd40816ef5" width="600">

https://pea-sys.github.io/jupyterlite-demo/lab/index.html

- 7. デフォルトの設定を変えたい場合は、repl フォルダ配下に override.json を作成します  
     例えば、次のようにすることでデフォルトでダークテーマで表示します。

```json
{
  "@jupyterlab/apputils-extension:themes": {
    "theme": "JupyterLab Dark"
  }
}
```

- 8. デフォルトで使用できるパッケージは少ない  
     pandas を使用するには、各種ライブラリをインストールします。

```Python
import piplite
piplite.install("matplotlib==3.3.3")
piplite.install("itkwidgets>=1.0a5")
piplite.install("skimage==0.19.2")
piplite.install("pandas>=1.4.0")
piplite.install("pooch>=1.3.0")
```

<img src="https://github.com/user-attachments/assets/e4483ce8-b87e-46aa-8e7f-f9bd400389ee" width="600">

- 9. Kernel を追加したい場合は、repl フォルダ配下の requirements.txt を編集する  
     例えば、SQliteKernel を使いたい場合、次の行を追加する

```
# SQLite kernel（optional)
jupyterlite_xeus_sqlite
```

デプロイされた Notebook に SQLite が追加されていることが確認できる

<img src="https://github.com/user-attachments/assets/64afedeb-526b-443a-86c0-033ad0039156" width="600">

最終的な成果物

https://pea-sys.github.io/jupyterlite-demo/lab/index.html

以上
