# WORD SLIDE

15パズル × Wordle の英単語パズル。4×4盤面の15枚の文字タイルをスライドさせ、隠された4つの英単語を完成させます。

## 起動方法

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 型チェック + 本番ビルド (dist/)
npm run preview    # ビルド結果の確認
npm test           # Vitest ユニットテスト
npx playwright install chromium   # 初回のみ
npm run e2e        # Playwright (desktop + mobile)
```

## ゲームルール

- 上3行 = 4文字単語×3（**順番は自由**）、最下段の左3マス = 3文字単語、右下は空白。
- 空白に上下左右で隣接するタイルのみ移動可能（タップ / スワイプ / 矢印キー。矢印はタイルが動く向き）。
- **CHECK** で Wordle 形式（緑=位置一致 / 黄=含まれる / 灰=なし）に色分け。順番自由のため、各行は最も一致する正解単語（緑最多→黄最多→固定順）と比較されます。この対応は CHECK ごとに変わることがあります。
- **WORDS FOUND** は現在盤面で完成している単語数（CHECK不要、崩せば減る）。4/4 かつ右下が空白で自動クリア。
- Daily: 日本時間0:00更新、全員同じ問題。Endless: Easy/Normal/Hard。

## 構成

| パス | 役割 |
|---|---|
| `src/core/board.ts` | Board / Movement |
| `src/core/generator.ts` | PuzzleGenerator（シード固定、正解盤面から合法手シャッフル＝到達可能性保証） |
| `src/core/wordle.ts` | WordleEvaluator |
| `src/core/matcher.ts` | WordMatcher |
| `src/core/game.ts` | GameState（reducer） |
| `src/storage/` | Storage（localStorage, version付き）/ Statistics |
| `src/ads/AdSlot.tsx` | Ads（プレースホルダー、同意バナー） |
| `src/data/words.ts` | 自作の単語リスト（ティア付き、`WORDS_VERSION`） |

デイリー再現性: シード = `GENERATOR_VERSION` + 日付。アルゴリズム/辞書を変えるとバージョンを上げる（過去問題が変わるため、公開後は凍結推奨）。

## 広告

既定ではプレースホルダーのみ。AdSense を使う場合は `.env.local` に設定:

```
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_SLOT=1234567890
```
設定すると同意バナーが表示され、同意後にのみ広告スクリプトを読み込みます。

## デプロイ (Vercel)

リポジトリを Vercel にインポート（Framework: Vite、build `npm run build`、output `dist`）。環境変数に上記を設定。ハッシュルーティングのため rewrite 不要。
公開前に `src/ui/Pages.tsx` の Contact / Privacy / Terms を運営者情報で更新し、OGP の URL を絶対URLにしてください。
