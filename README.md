# ART SLIDE

有名絵画のスライドパズル（メイン）。補助として BIG SLIDE と WORD SLIDE も同じサイトで遊べます。

| URL | 内容 |
|---|---|
| `/`, `/art-slide`, `/art-slide/{daily,gallery,play/<id>,how,stats,credits}` | **ART SLIDE（メイン）** |
| `/big-slide`, `/big-slide/{daily,endless,how,stats}` | BIG SLIDE（補助） |
| `/word-slide`, `/word-slide/{daily,endless,how,stats}` | WORD SLIDE（補助） |
| `/settings /about /privacy /terms /contact` | 共通ページ |

ART SLIDE のホームの下部「MORE PUZZLES」から BIG / WORD へ移動でき、各ホームの左上「‹ ART SLIDE」でメインに戻ります。旧URL（`/#/daily` など）は `/word-slide/...` に自動転送されます。Cloudflare Pages は `404.html` が無ければ SPA として未知のパスを `index.html` に返すので、リライト設定は不要です。ART SLIDE は他のゲームと別の、モノクロで線の細いデザイン（`.art-theme`）です。

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

- **トリミングなし**: 盤面は絵画の縦横比と同じ形で、分割数（横×縦）も縦横比から決めます（`logic/grid.ts`。タイルはほぼ正方形、ピース数はレベルごとに約 9 / 16 / 25 個で必ず増える）。全タイルが同じ画像を参照し、`background-size/position` だけが違います（`logic/tiles.ts`）。
- 問題は完成盤面から合法手だけで作るので必ず解けます（シード固定で再現可能）。デイリーは 4×4、日本時間 0:00 更新、作品も日付から決定的（`DAILY_POOL_V1` は凍結。追加するときは新しいプール版を作る）。
- 保存キーは `artslide:save`（途中経過・ベスト・デイリー履歴・タイル番号表示の設定）。
- PREVIEW / **SHUFFLE**（現在の盤面から合法手だけでタイルを **実際に順番にスライド** させて新しい配置にする。必ず解ける。動かした後は確認あり。完成後は PLAY AGAIN で同じ動きになる）/ RESTART（同じ初期配置）/ CHANGE ARTWORK、画像読み込み失敗時のエラー表示と再試行、結果共有（デイリーは作品名を含めない）。

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

## 広告（Adsterra）

3ゲーム共通の `AdBanner`（`src/components/AdBanner.tsx`、設定は `src/ads/adsterra.ts`）。

- **サイズ**: 画面幅 728px 以上は 728×90、728px 未満は 300×250。ただし ART SLIDE / BIG SLIDE のパズル画面は、幅 900px 以上（PC）では右の列の下側に置くため 300×250 を使い、パズル本体を画面の高さいっぱいまで大きく表示します（ページはスクロール不要）。316px 未満の画面では縮小してはみ出しません。「Advertisement」（言語に応じて翻訳）と明示し、盤面と操作ボタンの下に **1ページ1枠** だけ出します（`atOptions` の衝突を避けるため、各広告はサイト内の専用ページ `/ads/mobile.html` / `/ads/desktop.html` を `sandbox` 付き iframe で読み込んで実行します。ページ自体が自サイトなので、広告側には自ドメイン・リファラが見えます（配信元の検証に必要）。トップページの遷移は許可せず、クリックで開く新規タブのみ許可。広告ページは開発サーバー/ビルドの両方で同じ定義から生成）。
- **既定**: 開発サーバーではプレースホルダー、本番ビルドでは広告を表示します（`VITE_ADS_ENABLED=false` でビルドすると広告なし）。広告が読み込めない/ブロックされてもゲームは影響を受けません。
- **同意管理**: EU/EEA・英国・スイス（時間帯・ブラウザ地域で判定。不明なら同様）は同意（Accept）するまで読み込まず、それ以外は設定画面の「Allow ad cookies」でいつでもオフにできます。プライバシーポリシーを広告配信に対応させてあります。
- **Popunder / Social Bar は使っていません。**
- テスト: `?ads=live`（開発サーバー専用）でダミースクリプトを使い、iframe 隔離・サイズ切替・再レンダリングで再挿入されないこと・ブロック時の動作・地域別同意を検証しています。

配信ドメイン `https://bauval.org/22/<key>` は Adsterra の管理画面のコードと一致する公式のものであることを確認済みです（差し替えが必要になったら `VITE_ADSTERRA_SCRIPT_BASE`）。CSP を設定する場合は、`script-src` に広告ドメインを許可してください（広告は `about:srcdoc` の iframe 内で実行されます）。広告が表示されないときは、Adsterra の審査状態、広告コード、ブラウザのコンソール、広告ブロッカー、CSP の順に確認します。

## デプロイ (Cloudflare Pages / 本番)

静的サイトのみ（バックエンド不要）。GitHub 連携で自動デプロイできます。

1. Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Connect to Git → このリポジトリを選択
2. Framework preset: Vite（または手動で）  Build command: `npm run build`  Build output directory: `dist`
3. 環境変数: `NODE_VERSION=22`（`.node-version` でも指定済み）、広告を使う場合は `VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT`
4. History API ルーティング（`/word-slide`, `/big-slide`）。`404.html` を置かない限り Pages が SPA フォールバックするので rewrite 設定は不要。`public/_headers` でアセットのキャッシュを設定済み。

公開前に `src/ui/Pages.tsx` の Contact / Privacy / Terms を運営者情報で更新し、OGP の URL を絶対URLにしてください。

## 動き（アニメーション）

「ぬるっと」した共通のイージング（`--ease`）で、くどくならない範囲に絞っています。ページ遷移は進むと右から、戻ると左からスライドイン（`<html data-nav>`）、ホームの要素は順に浮き上がり、ギャラリーのカードは少しずらして現れ、ダイアログは下からスライドします。タイルの移動は `left/top` のトランジションで滑らかに動きます。OS の「視差効果を減らす」設定ではアニメーションを止め、SHUFFLE も一瞬で切り替わります。

## シェアと SNS プレビュー

結果画面の「共有」で、結果（作品名・作者・時間・手数）を文章に織り込んだメッセージ＋リンクを、X / LINE / Facebook / コピー（対応端末ではOS標準の共有）で送れます。文面は選択中の言語です。

リンクは `https://<サイト>/s/<作品ID>/`。SNS が開くと、その作品を **パズル風に分割して1枚だけ滑らせた画像**（`og/<作品ID>.jpg`, 1200×630）がプレビューに出ます。ビルド時に `scripts/make-share-assets.ts` が作品数ぶんの画像と静的ページ（OG/Twitter メタ付き。開くとゲームへ転送）を `dist/` に生成します。

- **本番では環境変数 `SITE_URL`（例 `https://example.com`）を必ず設定**してください（OG画像は絶対URLが必要）。未設定でも Cloudflare Pages の `CF_PAGES_URL` を使います。アプリ側の共有リンクも同じ `VITE_SITE_URL` を設定すると本番ドメインになります（未設定なら開いているURL）。
- ローカル確認: `npm run share-assets`（`public/og`, `public/s` に出力。git管理外）。

## 言語

設定画面の「Language」で、English / 日本語 / 中文（简体） / 한국어 / Español / Français / Deutsch に切り替えられます（初回はブラウザの言語）。ART SLIDE の全画面、設定、共有文面、BIG/WORD のホームと操作ボタンを翻訳しています。**未翻訳（英語のまま）**: BIG/WORD の遊び方ページ、プライバシーポリシー・利用規約・お問い合わせ、作品名・作者名・作品解説（データは英語）。辞書は `src/i18n/`（英語が基準。テストで全言語の全キーとプレースホルダーを検証）。

