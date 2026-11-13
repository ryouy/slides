# SLIDE GAMES（WORD SLIDE + BIG SLIDE）

同一サイトで2つのスライドパズルを遊べます。

| URL | 内容 |
|---|---|
| `/` | ゲーム選択（ゲームの切り替えはここだけ。各ゲームのホームに「ALL GAMES」と「MORE GAMES」の導線あり） |
| `/word-slide`, `/word-slide/{daily,endless,how,stats}` | WORD SLIDE |
| `/big-slide`, `/big-slide/{daily,endless,how,stats}` | BIG SLIDE |
| `/art-slide`, `/art-slide/{daily,gallery,play/<id>,how,stats,credits}` | ART SLIDE |
| `/settings /about /privacy /terms /contact` | 共通ページ |

旧URL（`/#/daily` など）は `/word-slide/...` に自動で転送されます。Cloudflare Pages は `404.html` が無ければ SPA として未知のパスを `index.html` に返すので、リライト設定は不要です。

## WORD SLIDE

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
- **WORD CLUES**（盤面下の4枚のカード）: 文字数・カテゴリー・意味・伏せ字を表示。カード番号は行番号とは無関係（3文字単語=WORD 4 のみ最下段固定）。
  - ヒント: Category → Meaning → 1st letter → +Letter（未公開の最小位置を1文字ずつ公開。重複なし・決定的）。
  - 初期ヒント: Easy=カテゴリー+意味 / Normal=カテゴリー / Hard=なし（Daily は Normal 固定で全員同条件）。初期ヒントは使用回数に含めない。
- **CHECK**: 比較したい「行」(1-4) と「単語カード」を選んで CHECK。選んだ行だけを選んだ単語と Wordle 判定（緑=その単語の同位置 / 黄=含まれる / 灰=なし）。行1-3 ↔ 4文字カード、行4（左3マス）↔ 3文字カード。タイルを動かすと色は消え、履歴（行・カード・文字・色）は残る。
- **WORDS FOUND** は現在盤面で完成している単語数（CHECK不要、崩せば減る）。完成行は緑枠、カードに ✓。4/4 かつ右下が空白で自動クリア。
- ヒント・CHECK を一度も使わずクリアすると **NO HINT CLEAR**。
- Daily: 日本時間0:00更新、全員同じ問題。Endless: Easy/Normal/Hard。

## BIG SLIDE

- 盤面 4×4 / 5×5 / 6×6。1×1 の数字タイル + 大きなブロック + 空白。ブロックの組み合わせ（Endless で選択）:

  | セット | ブロック | 空白 | 数字タイル(4×4/5×5/6×6) |
  |---|---|---|---|
  | Classic | 2×2 を1枚 | 2 | 10 / 19 / 30 |
  | Duo | 2×2 を2枚（A, B。入れ替え不可） | 3 | 5 / 14 / 25 |
  | Shapes | L字ブロック + 1×2 ブロック | 3 | 7 / 16 / 27 |
  | Mega | 2×3 を1枚 | 3 | 7 / 16 / 27 |

  ブロックの形は `Piece.cells`（セルのオフセット一覧）で表現するので、L字・T字など任意の形を `variants.ts` に足すだけで増やせます（回転はしません）。
- 数字タイルは隣接する空白へ、ブロックは「移動後の形の全マスが盤内で、空白または自分自身のマス」のときだけ上下左右に1マス移動できます（L字の切り欠きも正しく扱います。斜め・回転・重なり・盤外は不可）。
- 全タイルが GOAL の位置に揃えばクリア（全ブロックの位置も判定）。GOAL は盤面の下の小さな完成図（折りたたみ可）。
- 操作: タップ（方向が複数あるときは矢印が出る）、スワイプ、矢印キー。不正な操作は盤面もカウントも変えません。
- 記録: TIME / MOVES / BIG MOVES、自己ベスト（サイズ×難易度別）、連続クリア、デイリー履歴。保存キーは `bigslide:save`（WORD SLIDE の `wordslide:save` とは別）。
- デイリー: 4×4 Normal 固定、日本時間 0:00 更新。
- **問題生成**: ゴール配置（BIG の位置はシードで変化）から合法手だけで作るので必ず解けます。全ブロックの初期位置とゴール位置は必ず異なり、解の中で必ず動かします。Classic の生成結果は従来と同一です（デイリーは変わりません）。
  - Easy: 最短 5〜8 手（BIG 1回以上）/ Normal: 最短 12〜16 手（BIG 1回以上）。ゴールと初期盤面の両側から幅優先探索（meet in the middle）をして **最短手数を厳密に確認**しています。
  - Duo/Shapes/Mega は同様に厳密検証（ただしジャム気味の盤面なので帯は短め。Hard は 4×4 の Duo/Mega で厳密、それ以外は参照解）。
  - Hard: 最短手数を厳密に求めるには深すぎるため、BIG を必ず複数回動かすスクランブル + 局所探索で短縮した参照解（20手以上・BIG 2回以上）を用いています（厳密な最短ではなく上限）。まれに条件を満たせない場合は一段下の難易度で出題します。

## ART SLIDE

名画を 3×3 / 4×4 / 5×5 に分割したクラシックなスライドパズル（空白は常に1マス）。完成すると最後の欠けたピースが現れ、継ぎ目が消えて絵画が完成します。

- **画像は1枚をCSSで分割**: 全タイルが同じ画像を参照し、`background-size/position` だけが違います（`logic/tiles.ts`）。正方形盤面には中央トリミング（作品ごとに `focus` で位置調整可）で、引き伸ばしはしません。選択画面・プレビュー・結果画面では作品全体を表示します。
- 問題は完成盤面から合法手だけで作るので必ず解けます（シード固定で再現可能）。デイリーは 4×4、日本時間 0:00 更新、作品も日付から決定的（`DAILY_POOL_V1` は凍結。追加するときは新しいプール版を作る）。
- 保存キーは `artslide:save`（途中経過・ベスト・デイリー履歴・タイル番号表示の設定）。
- PREVIEW / RESTART（同じ初期配置）/ NEW PUZZLE / CHANGE ARTWORK、画像読み込み失敗時のエラー表示と再試行、結果共有（デイリーは作品名を含めない）。

### 収録作品と権利

**104作品**（Art Institute of Chicago 98点 + The Met 6点）、すべて **美術館の公式APIでパブリックドメインと確認** した CC0 画像のみです（AIC: `is_public_domain = true`、Met: `isPublicDomain = true`）。各作品の出典ページ・ライセンス・確認日・取得元URLは `src/games/art-slide/data/artworks.ts` に記録され、アプリ内の「Credits」ページ（`/art-slide/credits`）にも全作品が表示されます。

- 作品解説: 最初の18作品は手書きの短文、残りは美術館の目録データ（作者・年・技法・テーマ）から組み立てた短い事実文です（美術館の解説文は転載していません）。
- **ギャラリー**: 検索（作品名・作者・テーマ・年代）、グループ分け（テーマ / 作者 / 年代）、並べ替え（作者 / 作品名 / 年 古い順・新しい順）。選択は保存されます。ロジックは `logic/gallery.ts`。
- デイリーの作品は固定プール（`data/daily-pools.ts`、2026-11-14 以降。それ以前は V1 の18作品）から決まり、プールは凍結されているので過去の日付は変わりません。

画像の選定・取得（再実行可能）:

```bash
node scripts/select-artworks.mjs   # AIC APIからPD作品を検索 → scripts/selection.json（コミット済み。通常は再実行不要）
node scripts/fetch-artworks.mjs    # 各作品のPDフラグをAPIで再確認 → public/artworks/*.webp と data/artworks.ts を生成
```
PDフラグが立っていない作品は取得を拒否します。AIC の画像サーバーは `AIC-User-Agent` ヘッダーが必要で、APIにはレート制限（429）があるため、スクリプトは間隔を空けて再試行します。**Met のAPIは一括アクセスで一時ブロック（403）されたため、Met の6作品は確認済みデータ（`scripts/met-cache.json`）を使っています。** テーマ分類は作品ごとに手で確認したテーブル（`THEME_BY_ID`）です。

## 構成

共通部品は `src/components/`（SiteHeader / Link / ResultModal / Landing）、`src/hooks/`、`src/utils/`、`src/ads/`、`src/router.ts`。BIG SLIDE は `src/games/big-slide/{logic,components,pages}` に独立しています。WORD SLIDE は従来の場所（`src/core`, `src/ui`, `src/storage`, `src/data`）のままです。

| パス | 役割 |
|---|---|
| `src/core/board.ts` | Board / Movement |
| `src/core/generator.ts` | PuzzleGenerator（シード固定、正解盤面から合法手シャッフル＝到達可能性保証） |
| `src/core/wordle.ts` | WordleEvaluator（行 vs 単語） |
| `src/core/hints.ts` | 単語カードのヒント状態・公開ルール |
| `src/core/nextMove.ts` | 将来の NEXT MOVE 用インターフェース（未実装） |
| `src/core/matcher.ts` | WordMatcher |
| `src/core/game.ts` | GameState（reducer） |
| `src/storage/` | Storage（localStorage, version付き）/ Statistics |
| `src/ads/AdSlot.tsx` | Ads（プレースホルダー、同意バナー） |
| `src/data/words.ts` | 自作の単語データ（`WordEntry`: word / category / definition / difficulty、`WORDS_VERSION`） |

デイリー再現性: シード = `GENERATOR_VERSION` + 日付。アルゴリズム/辞書を変えるとバージョンを上げる（過去問題が変わるため、公開後は凍結推奨）。

## 広告

既定ではプレースホルダーのみ。AdSense を使う場合は `.env.local` に設定:

```
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_SLOT=1234567890
```
設定すると同意バナーが表示され、同意後にのみ広告スクリプトを読み込みます。

## デプロイ (Cloudflare Pages / 本番)

静的サイトのみ（バックエンド不要）。GitHub 連携で自動デプロイできます。

1. Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Connect to Git → このリポジトリを選択
2. Framework preset: Vite（または手動で）  Build command: `npm run build`  Build output directory: `dist`
3. 環境変数: `NODE_VERSION=22`（`.node-version` でも指定済み）、広告を使う場合は `VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT`
4. History API ルーティング（`/word-slide`, `/big-slide`）。`404.html` を置かない限り Pages が SPA フォールバックするので rewrite 設定は不要。`public/_headers` でアセットのキャッシュを設定済み。

公開前に `src/ui/Pages.tsx` の Contact / Privacy / Terms を運営者情報で更新し、OGP の URL を絶対URLにしてください。
