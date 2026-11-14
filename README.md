# ART SLIDE

名画をスライドして完成させるパズルゲーム。絵画を探して遊べるギャラリーと、毎日更新されるデイリーパズルがあります。

**[ART SLIDE](https://slides.ryouy.workers.dev/art-slide)** · [BIG SLIDE](https://slides.ryouy.workers.dev/big-slide) · [WORD SLIDE](https://slides.ryouy.workers.dev/word-slide)

## 開発

```bash
npm install
npm run dev
npm run build
npm test
```

React / TypeScript / Vite。ビルド結果は `dist/` に出力されます。

## 主な機能

- **ART SLIDE** — 作品の閲覧・検索、難易度選択、プレビュー、シャッフル、デイリーパズル
- **ギャラリー** — 作者・テーマ・年代別の表示、ランダムを含む並べ替え、1行あたり1〜6枚の表示
- **BIG SLIDE / WORD SLIDE** — 別ルールのスライドパズル
- **共通** — 7言語対応、ローカルでの進行状況・記録の保存

## 作品データ

美術館の公式APIで利用条件を確認した作品を収録。画像や説明文の出典・権利情報は作品ごとに保持しています。

- `src/games/art-slide/data/artworks.ts` — 初期作品
- `src/games/art-slide/data/additional-artworks.ts` — Colabから追加した作品
- `public/artworks/` — ゲーム画像とサムネイル
- `notebooks/` — GitHubへ作品を直接追加するColabノートブック

新しい作品はギャラリーへ自動反映されます。過去のデイリーパズルの再現性を保つため、`daily-pools.ts` の既存リストは変更しません。

## デプロイ

Viteの静的サイトとして配信します。ビルドコマンドは `npm run build`、公開ディレクトリは `dist` です。SNSプレビュー画像の絶対URLには、本番環境で `SITE_URL` を設定してください。
