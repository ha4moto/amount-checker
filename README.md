# amount-checker

請求書の内容と金額をチェックするアプリです。

## ブラウザで確認するURL

GitHub Pagesで公開する設定を追加しています。PRが `main` ブランチへマージされ、GitHub Actions の **Deploy static UI to GitHub Pages** が完了すると、以下のURLでUIを確認できます。

```text
https://<GitHubユーザー名またはOrganization名>.github.io/amount-checker/
```

> この作業環境にはGitHubのリモートURLと認証情報が無いため、実際の `<GitHubユーザー名またはOrganization名>` を自動取得して公開完了まで確認することはできません。GitHub上では、Actions完了後にワークフローの `github-pages` environment に実際の公開URLが表示されます。

## GitHub Pagesの公開設定

このPRには、静的ファイルをGitHub Pagesへ公開するための以下のファイルが含まれています。

- `.github/workflows/pages.yml`: `main` への push または手動実行で、リポジトリ直下の静的UIをGitHub Pagesへデプロイします。
- `.nojekyll`: GitHub Pagesで静的ファイルをそのまま配信するための空ファイルです。
- `index.html`: UI本体です。
- `styles.css`: UIのスタイルです。
- `app.js`: PDFファイル選択時の表示更新です。

## 手動で公開状態を確認する手順

1. このPRを `main` ブランチへマージします。
2. GitHubのリポジトリ画面で **Actions** タブを開きます。
3. **Deploy static UI to GitHub Pages** ワークフローが成功するまで待ちます。
4. 成功した実行結果の **github-pages** environment に表示されるURLを開きます。
5. `金額チェッカー` の画面が表示されれば公開完了です。
