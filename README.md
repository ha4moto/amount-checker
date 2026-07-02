# amount-checker

請求書PDFの明細・小計・消費税・合計を再計算し、金額が正しいかを確認するブラウザ用の静的Webアプリです。

## 現在のUI

- PDFファイル選択欄
- 項目推測と計算ルールの表示
- 請求書形式の明細テーブル
- 不一致セルの赤色表示
- 正しい場合の「正しい！」表示
- チェック結果一覧

## GitHub Pagesで確認するURL

GitHub Pagesで公開する設定を含めています。PRが `main` または `master` ブランチへマージされ、GitHub Actions の **Deploy static UI to GitHub Pages** が成功すると、以下の形式のURLでUIを確認できます。

```text
https://<GitHubユーザー名またはOrganization名>.github.io/amount-checker/
```

実際の公開URLは、GitHub Actions の実行結果にある `github-pages` environment に表示されます。

## GitHub Pages公開設定

このPRには、静的UIをGitHub Pagesへ公開するための設定を含めています。

- `.github/workflows/pages.yml`: `main` / `master` への push または手動実行で、リポジトリ直下をGitHub Pagesへデプロイします。
- `.nojekyll`: GitHub Pagesで静的ファイルをそのまま配信するための空ファイルです。

## アプリの構成

- `index.html`: UI本体です。
- `styles.css`: 画面レイアウト、判定バナー、不一致セルなどのスタイルです。
- `app.js`: PDFファイル選択時に読み込み状態を表示します。

## 公開後の確認手順

1. PRを `main` または `master` ブランチへマージします。
2. GitHubのリポジトリ画面で **Actions** タブを開きます。
3. **Deploy static UI to GitHub Pages** ワークフローが成功するまで待ちます。
4. 成功した実行結果の **github-pages** environment に表示されるURLを開きます。
5. `金額チェッカー` の画面が表示されれば公開完了です。

## ローカルで確認する方法

```bash
python3 -m http.server 4173
```

ブラウザで以下を開きます。

```text
http://127.0.0.1:4173/
```
