# Reflection & 5年日記

リフレクション（内省質問）と5年日記を組み合わせた自己成長ツール。

## 機能

### リフレクション
- 61の内省質問からランダムに表示
- カテゴリ：リーダーシップ、自己成長、人間関係、仕事、人生
- 同じ質問への過去の回答を一覧表示

### 5年日記
- 同じ月日の過去年の記録を並べて表示
- 2/29の記録は2/28として扱う（うるう年対応）

### データ保存
- GitHub APIでリポジトリに自動保存
- 複数デバイスから同じデータにアクセス可能
- ローカルストレージにもバックアップ

## セットアップ

1. このリポジトリをフォークまたはクローン
2. GitHub Pagesを有効化（Settings → Pages → Source: main branch）
3. Personal Access Token (PAT) を作成
   - Settings → Developer settings → Personal access tokens → Tokens (classic)
   - `repo` 権限をチェック
4. アプリの設定画面でリポジトリ名とPATを入力

## ファイル構成

```
/
├── index.html
├── style.css
├── app.js
├── questions.js
├── data/
│   ├── reflections.json
│   └── diary.json
└── README.md
```

## 質問のカスタマイズ

`questions.js` を編集して質問を追加・変更できます。

```javascript
{ id: 62, category: "カテゴリ名", text: "新しい質問" }
```

## License

MIT
