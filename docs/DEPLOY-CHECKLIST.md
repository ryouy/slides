# 本番デプロイ前後のチェックリスト（Premium / ログイン / Drive 同期）

対象: `https://slides.ryouy.workers.dev`（Cloudflare Workers・Git 連携の自動デプロイ）。
このファイルは「**課金を有効にしないまま**、まず安全にデプロイして確認する」ための手順です。設定の詳しい画面操作は [PREMIUM.md](PREMIUM.md) にあります。

**確定した仕様:** Free は絵画 **40 点**（固定 ID）・盤面は**レベル 5 まで**・広告あり／Premium は**登録済みの全作品（現在 404 点。今後追加される作品も自動で対象）**・盤面は**レベル 7 まで**・広告なし／デイリーパズルは全員が利用可。

---

## 0. 【重要】初回デプロイの前に必ずやること：Variable を Secret に作り直す

Cloudflare のダッシュボードで **「Variable」として登録した値は、`npx wrangler deploy` のたびに削除されます**（設定ファイル `wrangler.jsonc` に書かれていない Variable は消える仕様です。**「Secret」は消えません**）。
現在 **Variable** として登録されている次の 3 つが、最初のデプロイで消えます。

| 名前 | 現在 | 対処 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Variable | **Secret に作り直す**（同じ名前・同じ値） |
| `STRIPE_PRICE_ID` | Variable | **Secret に作り直す**（値は `price_…`。`prod_…` ではない） |
| `STRIPE_PUBLISHABLE_KEY` | Variable | **削除してよい**（使いません） |

**手順（初心者向け）**
1. Cloudflare → Workers & Pages → `slides` → Settings → **Variables and Secrets**
2. `GOOGLE_CLIENT_ID` の値をコピーして控える → その行を削除 → 「Add」→ 種類 **Secret**、名前 `GOOGLE_CLIENT_ID`、値を貼って保存
3. `STRIPE_PRICE_ID` も同じ手順で Secret に作り直す。**値が `price_` で始まることを確認**（`prod_` で始まるものは「商品 ID」で、使えません。Stripe の商品ページの「価格」の行にある ID です。前後に空白が入らないよう注意）
4. `STRIPE_PUBLISHABLE_KEY` は削除

（別の方法として、Deploy command を `npx wrangler deploy --keep-vars` に変えると Variable が残ります。ただし、設定が画面と二重管理になるので、Secret への作り直しをおすすめします。）

**もし作り直さずにデプロイしてしまっても大丈夫です。** 値が消えるとログイン・購入の API が「未設定（503）」に戻るだけで、**サイトは今までどおり動きます**（ローカルで再現して確認済み）。Secret に作り直してから再デプロイすれば復旧します。

`STRIPE_WEBHOOK_SECRET` は未登録で構いません。未登録のあいだは、ログインは使え、購入は無効のまま、Webhook の受信口は 503（閉じた状態）になります（これも確認済み）。

### Stripe の値の確認（設定ミスの安全装置）
- `STRIPE_PRICE_ID` が `price_…` の形でない（`prod_…` など）、`STRIPE_SECRET_KEY` が `sk_…`／`rk_…` でない（`pk_…` など）場合、**Checkout を開始せず**、`503`（`invalid_price_id` または `invalid_stripe_key`）を返して Stripe には何も送りません。`/api/config` の `purchases` も `false` のままです。
- 公開可能キー（`pk_…`）は、どの処理でも使いません。

---

## 1. 本番デプロイ前に必要な設定項目の最終一覧

### 1-A. Cloudflare（デプロイを通すために必須）

| # | 項目 | 値・確認内容 | どこで | 無いとどうなる |
|---|---|---|---|---|
| 1 | Worker 名 | `wrangler.jsonc` の `"name": "slides"` が、ダッシュボードの Workers & Pages に表示されている**実際の名前と完全に同じ** | Workers & Pages の一覧 | ビルドが失敗する（**公開中のサイトはそのまま動き続ける**）。違う場合は `wrangler.jsonc` の `name` を実際の名前に直して push |
| 2 | D1 のバインディング | `DB` → `slides-db`、ID `477ac683-93d6-4d57-a8e9-18d699c57ab7`（`wrangler.jsonc` に設定済み） | Storage & databases → D1 | ID が違うとデプロイが失敗する（旧版は動き続ける）。ID は D1 の画面で確認 |
| 3 | Git 連携のビルド設定 | Build command `npm run build`／Deploy command `npx wrangler deploy`／Root `/`（確認済みとのことなので変更不要） | Settings → Build | — |
| 4 | D1 のテーブル | `migrations/0001_init.sql` を `slides-db` に適用（**手順は 2 章**） | D1 → `slides-db` → Console | ログイン開始（`/api/auth/google`）が 500 になる。サイトは影響なし |

### 1-B. Secrets（Cloudflare の Settings → Variables and Secrets に **Secret** として登録。**Variable ではなく必ず Secret**）

| 名前 | 何の値か | 入手先 | 必要になる段階 |
|---|---|---|---|
| `SESSION_SECRET` | ログイン Cookie などの署名用の長い乱数 | Mac のターミナルで `openssl rand -base64 48` | 段階 1（ログイン確認） |
| `GOOGLE_CLIENT_ID` | OAuth クライアント ID（公開してよい値） | Google Cloud → 認証情報 | 段階 1 |
| `GOOGLE_CLIENT_SECRET` | OAuth クライアント シークレット（**秘密**） | 同上 | 段階 1 |
| `STRIPE_SECRET_KEY` | Stripe のシークレットキー（テスト: `sk_test_...`） | Stripe → 開発者 → API キー | 段階 1（`/api/config` の `billing` が true になる条件） |
| `STRIPE_PRICE_ID` | 月額 ¥200 の価格 ID（`price_...`） | Stripe → 商品カタログ | 段階 1 |
| `STRIPE_WEBHOOK_SECRET` | Webhook の署名シークレット（`whsec_...`） | Stripe → 開発者 → Webhook（**デプロイ後**に作成） | 段階 1 |

`STRIPE_PUBLISHABLE_KEY`（`pk_...`）は**不要**です（購入は Stripe の画面へ移動する方式のため。コードは一切読みません）。

**現在の登録状況（ご連絡いただいた内容）:** `GOOGLE_CLIENT_SECRET`・`SESSION_SECRET`・`STRIPE_SECRET_KEY` は Secret として登録済み（OK）。`GOOGLE_CLIENT_ID`・`STRIPE_PRICE_ID` は Variable（**0 章のとおり Secret に作り直す**）。`STRIPE_WEBHOOK_SECRET` は未登録（デプロイ後に作成。それまでは購入が無効なだけ）。

### 1-C. 変数・フラグ（課金を有効にするまで**触らない**）

| 名前 | 既定 | 場所 | 有効にする時 |
|---|---|---|---|
| `PURCHASES_ENABLED` | `"false"` | `wrangler.jsonc` の `vars`（コードで管理） | 最終公開の直前だけ `"true"` |
| `VITE_PREMIUM_ENABLED` | 未設定 | Cloudflare の **ビルド変数**（Settings → Build → Variables and secrets） | 最終公開の直前だけ `true` |
| `src/legal/operator.ts`（運営者情報 5 項目） | 空欄 | コード | 運営者が入力するまで購入ボタンは使えない |

### 1-D. Google Cloud（ログイン／Drive 同期）

- Google Drive API を有効化
- OAuth 同意画面: スコープ `openid` / `profile` / `drive.appdata`、テストユーザーに自分のアカウント
- OAuth クライアント（ウェブ アプリケーション）
  - 承認済みの JavaScript 生成元: `https://slides.ryouy.workers.dev`（Drive 同期に必須）
  - 承認済みのリダイレクト URI: `https://slides.ryouy.workers.dev/api/auth/callback`
  - ローカル確認用に `http://localhost:8787` と `http://localhost:8787/api/auth/callback`

### 1-E. Stripe（テストモード）

- 月額 ¥200 の価格（JPY・月次）
- カスタマーポータル（期間終了時のキャンセル、支払い方法の更新）
- Webhook エンドポイント `https://slides.ryouy.workers.dev/api/stripe/webhook`（イベント: `checkout.session.completed` / `customer.subscription.created|updated|deleted` / `invoice.paid` / `invoice.payment_failed`）

### 1-F. 段階ごとのまとめ（どの時点で何が揃っていればよいか）

| 段階 | 状態 | サイトの見た目 | `/api/config` |
|---|---|---|---|
| 0 | 初回デプロイ直後（テーブルも Secrets も無し） | **変わらない** | `{"auth":false,"billing":false,"purchases":false}` |
| 1a | テーブル作成済み + `STRIPE_WEBHOOK_SECRET` **以外**の Secrets 5 つ登録済み（**今の予定の状態**） | **変わらない** | `{"auth":true,"billing":false,"purchases":false,"googleClientId":"…"}` |
| 1 | テーブル作成済み + Secrets 6 つ登録済み。`PURCHASES_ENABLED="false"`、`VITE_PREMIUM_ENABLED` 未設定 | **変わらない**（画面にログインや Premium は出ない） | `{"auth":true,"billing":true,"purchases":false,"googleClientId":"…"}` |
| 2 | 最終公開（運営者情報入力・`PURCHASES_ENABLED="true"`・`VITE_PREMIUM_ENABLED=true`） | Free/Premium の制限・購入導線が出る | `purchases` が `true` |


### `/api/config` が `auth:false` のままのとき（Secrets を登録したのに）
`auth:true` になる条件は、`DB`・`SITE_URL`（どちらも `wrangler.jsonc` で設定済み）に加えて、ランタイムの **Secret** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SESSION_SECRET` の 3 つがすべて空でないことです（Stripe の値は関係しません）。次を順に確認してください。

1. 登録したあとで **「Deploy」** を押したか（保存しただけでは新しい版に入らないことがあります）。Deployments で最新の版に Secret が含まれているか確認
2. 登録した場所が **Settings → Variables and Secrets（ランタイム）** か。Settings → **Build** の Variables and secrets（ビルド時だけ）では Worker から見えません
3. 名前が完全に一致しているか（前後の空白、全角、綴り）
4. 名前が `slides` の Worker に登録したか
5. ターミナルで確認する場合: `npx wrangler login` のあと `npx wrangler secret list`（名前だけが表示され、値は見えません）

---

## 2. `migrations/0001_init.sql` の安全性と再実行時の挙動

**結論: 何度実行しても安全です。**（実際に新品の D1 と、データ入りの D1 の両方で確認しました）

| 確認項目 | 結果 |
|---|---|
| 破壊的な文 | **なし**。`DROP` / `ALTER` / `TRUNCATE` / `DELETE` / `INSERT` / `UPDATE` は一つも含みません（含まれるのは作成のみ） |
| 文の数 | `CREATE TABLE` 5 + `CREATE INDEX` 1 = 6 文。**すべて `IF NOT EXISTS` つき** |
| 新品の DB に適用 | 5 テーブル + 1 インデックスができる |
| 2 回目の適用（`wrangler d1 migrations apply`） | `No migrations to apply!`（適用済みとして記録されるので何もしない） |
| ダッシュボードの Console にもう一度貼って実行 | エラーなし。**既存の行は一行も変わらない**（users / subscriptions / sessions / stripe_events の件数と Stripe 顧客 ID が実行前後で同じことを確認） |
| 外部キー | 効いている（存在しないユーザーへのセッション追加は `FOREIGN KEY constraint failed` で拒否）。ユーザーを消すと、そのユーザーの契約・セッションも連鎖して消える。`stripe_events` は残る |
| 保存する個人情報 | Google の `sub`・表示名・Stripe 顧客 ID・契約状態のみ。**メールアドレス・カード情報・プレイ記録は入らない** |

**注意（再実行で直らないこと）:** `IF NOT EXISTS` は「無ければ作る」だけです。すでに**違う形**の同名テーブルがあると、何も変えずに通過します（古い形のまま残る）。今回は新規 DB なので問題ありませんが、将来テーブルを変えるときは `0001_init.sql` を**編集せず**、`migrations/0002_….sql` を追加してください。

**適用方法（どちらか 1 つ）**
- ダッシュボード: D1 → `slides-db` → **Console** に `0001_init.sql` の全文を貼って **Execute**（初心者向け）。完了後、Tables タブに `users` `subscriptions` `stripe_events` `sessions` `rate_limits` が並ぶ
- ターミナル: `npx wrangler login` → `npx wrangler d1 migrations apply slides-db --remote`

---

## 3. デプロイ後、課金を有効にせずに認証・API を確認する手順

前提: 段階 0 → 1 の順に進めます。**この間は `VITE_PREMIUM_ENABLED` も `PURCHASES_ENABLED` も触りません**（利用者の画面は一切変わりません）。

### 3-1. 自動チェック（コピペで実行）

リポジトリのフォルダで次を実行します（読み取り専用。ログインも購入もしません）。

```
node scripts/check-deploy.mjs https://slides.ryouy.workers.dev --stage 0    # デプロイ直後
node scripts/check-deploy.mjs https://slides.ryouy.workers.dev --stage 1 --before-webhook   # Webhook の Secret 以外を登録した状態（段階 1a）
node scripts/check-deploy.mjs https://slides.ryouy.workers.dev --stage 1    # Webhook の Secret も登録したあと
```

全項目に ✓ が付き `All checks passed` と出れば合格です。✗ が出た項目には原因のヒントが表示されます。

| ✗ の項目 | 主な原因 |
|---|---|
| `/api/config auth = true` が ✗ | Secrets が足りない（`SESSION_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` のどれか。**`GOOGLE_CLIENT_ID` を Variable のまま登録していると、デプロイで消えます**＝0 章）か、D1 の接続がない |
| `billing = true` が ✗ | Stripe の 3 つの Secret のどれかが足りない（`--before-webhook` を付けて実行していれば `STRIPE_WEBHOOK_SECRET` は不要）。`STRIPE_PRICE_ID` を Variable のままにしていると消えます＝0 章 |
| `purchases = false` が ✗ | `PURCHASES_ENABLED` が `"true"` になっている（**まだ早い**） |
| `/api/auth/google → redirect` が ✗（500） | D1 のテーブルが未作成（2 章を実施） |
| `redirect_uri is exactly …` が ✗ | `SITE_URL` が実際の URL と違う（Google Cloud の登録と一致させる） |
| `no secret-looking value in the site JavaScript` が ✗ | **秘密の値がサイトに混入している。直ちに公開を止めて値を再発行** |

### 3-2. 手動チェック（ログインが本当に通るか）

画面にはログイン導線が出ない（フラグ未設定のため）ので、URL を直接開きます。**自分の Google アカウント（テストユーザーに追加済み）で**行ってください。

1. ブラウザで `https://slides.ryouy.workers.dev/api/auth/google?return=/api/me` を開く
2. Google のログイン画面 → アカウントを選ぶ → 許可画面には「名前などの基本情報」だけが出る（**Drive の許可は出ない**ことを確認）
3. 戻ったあとの画面に `{"signedIn":true,"id":"…","googleSub":"…","name":"あなたの名前","premium":false,"status":null,…}` と表示される → ログイン成功（`premium` は `false` のまま）
4. D1 の Console で `SELECT id, name, stripe_customer_id FROM users;` → 1 行できている（`stripe_customer_id` は空）。`SELECT COUNT(*) FROM sessions;` → 1
5. ブラウザの開発者ツール（F12）→ Application → Cookies で `__Host-slides_session` が **HttpOnly・Secure・SameSite=Lax** になっている
6. 購入が**できないこと**の確認。開発者ツールの Console に貼る:
   ```js
   fetch('/api/billing/checkout',{method:'POST'}).then(r=>r.status+' '+r.statusText)
   ```
   → `503`（`purchases_disabled`）が返れば、課金は無効のままです。**200 や Stripe の URL が返ったら直ちに `PURCHASES_ENABLED` を確認**
7. ログアウト: Console で `fetch('/api/auth/logout',{method:'POST'}).then(r=>r.status)` → `200`。そのあと `/api/me` が `{"signedIn":false,…}` に戻る
8. アカウント削除の動作（任意）: ログインし直してから `fetch('/api/account/delete',{method:'POST'}).then(r=>r.status)` → `200`、D1 の `users` が 0 行に戻る

### 3-3. Stripe Webhook の確認（課金なし）

1. Stripe（テストモード）→ 開発者 → Webhook → エンドポイントを開く → 「テストイベントを送信」→ `invoice.paid` などを送る
2. Stripe の画面でレスポンスが **200**（成功）になる
3. D1 の Console で `SELECT event_id, type FROM stripe_events;` → 送ったイベントが 1 行入っている（同じイベントを「再送」しても行は増えない＝重複排除）
4. 署名が違うと 400 になること（`check-deploy.mjs` の stage 1 が確認済み）

### 3-4. サイトが無傷であることの確認

- `https://slides.ryouy.workers.dev/`・`/art-slide/gallery`・`/word-slide/daily`・`/big-slide` が従来どおり開く
- ART SLIDE で、ロックなしに**全作品・全レベル（3〜7）が遊べる**（フラグ未設定のため）
- 広告が従来どおり出る
- Cloudflare → Workers & Pages → `slides` → **Logs**（または `npx wrangler tail`）にエラーが出ていない

---

## 4. デプロイ失敗時・問題発生時の復旧手順

### 4-1. まず知っておくこと（安全の仕組み）

- **ビルドやデプロイが失敗しても、公開中のサイトは前の版のまま動き続けます**（Cloudflare は成功した版だけを切り替えます）。慌てて何かを直す必要はありません。
- Worker は `/api/*` のときだけ動きます。**静的なサイトの配信は Worker を通らない**ため、API の不具合がゲームの表示に影響することはありません。
- 課金は `PURCHASES_ENABLED="false"`（既定）のあいだ開始できません。

### 4-2. ビルド／デプロイが失敗した

1. Cloudflare → Workers & Pages → `slides` → **Deployments**（または Builds）→ 失敗したビルドの **ログ** を開く
2. よくある原因と直し方

| ログの内容 | 原因 | 直し方 |
|---|---|---|
| name が違う、といった内容 | Worker 名の不一致 | `wrangler.jsonc` の `"name"` を実際の名前に直して push |
| D1 database … not found / invalid | `database_id` の誤り | D1 の画面で ID を確認して `wrangler.jsonc` を直して push |
| `tsc` の型エラー | コードの不具合 | ログの行番号のとおりに修正（ローカルで `npm run build` を再現） |
| ネットワーク・一時的な失敗 | Cloudflare 側 | 「Retry build」 |

### 4-3. デプロイは成功したが、挙動がおかしい（コードを前の状態に戻す）

どちらか。**一番速い**のはダッシュボードです。

- **ダッシュボードでロールバック:** Workers & Pages → `slides` → **Deployments** → 一つ前の（正常だった）デプロイの「…」→ **Rollback to this deployment**。数秒で戻る。戻したあと `scripts/check-deploy.mjs` で確認
- **Git で取り消す:** 問題のコミットを `git revert <コミットID>` して push → 自動で再デプロイ（履歴が残る）

### 4-4. 緊急停止スイッチ（コードを変えずにすぐ止める）

| 止めたいもの | 操作 | 効果 |
|---|---|---|
| ログイン・Drive 同期・プラン判定すべて | Settings → Variables and Secrets で `SESSION_SECRET` を**削除** | `/api/*` が 503。**サイト本体は無影響**（利用者は Free 扱い） |
| 購入だけ | `STRIPE_SECRET_KEY` を**削除** | Checkout が 503（既存の契約者の Premium 判定は D1 の記録で継続） |
| Webhook の受信 | Stripe → Webhook → エンドポイントを「無効化」 | Stripe が再送を溜める（再有効化で追いつく） |
| 制限（ロック）表示 | ビルド変数 `VITE_PREMIUM_ENABLED` を削除して再デプロイ | 全作品・全レベルが元どおり解放される |

### 4-5. データを戻す（D1）

- D1 には**再作成できるデータだけ**（ユーザー・契約・セッション）が入っています。プレイ記録は入っていません。
- **Time Travel（30 日分の時点復元）:** `npx wrangler d1 time-travel info slides-db`（現在のブックマーク確認）→ `npx wrangler d1 time-travel restore slides-db --timestamp=<戻したい時刻 ISO>`。実行前に表示される「元に戻すためのブックマーク」を控えておくと、復元自体も取り消せます
- 誤った変更は、`0001_init.sql` を直さず **`0002_….sql` を追加して前に進める**（4 章の注意）
- 契約状態が D1 とずれた場合: 利用者が再ログインして `/api/billing/status?refresh=1` を開くと、Stripe の最新状態で自動補正されます。Webhook が失敗していた場合は、Stripe の Webhook 画面でイベントを「再送」

### 4-6. 想定外の課金・返金

- Stripe ダッシュボードで該当の支払いを **返金**、サブスクリプションを**キャンセル**
- アカウント画面（またはポータル）から解約しても、支払い済みの期間は Premium が続く仕様です

---

## 5. Phase 4 の Google Drive 同期を、本物の Google API で検証する手順

**目的:** 自動テストは Google を偽物に差し替えているため、本物の Google 認証・Drive で動くことを一度確認します。
**方針:** 利用者に影響しないよう、**自分のパソコン上のローカル環境**で、**本物の Google アカウント**を使って行います（本番サイトの設定は変えません）。

### 5-1. 準備（15 分ほど）

1. Google Cloud（1-D）が済んでいること。OAuth 同意画面が「テスト」で、**自分の Google アカウントがテストユーザー**に入っていること
2. リポジトリのフォルダで `.dev.vars` を作る（このファイルは Git に入りません）
   ```
   cp .dev.vars.example .dev.vars
   ```
   中身を編集:
   ```
   SITE_URL=http://localhost:8787
   SESSION_SECRET=（openssl rand -base64 48 の結果）
   GOOGLE_CLIENT_ID=（本物）
   GOOGLE_CLIENT_SECRET=（本物）
   STRIPE_SECRET_KEY=sk_test_dummy
   STRIPE_WEBHOOK_SECRET=whsec_dummy
   STRIPE_PRICE_ID=price_dummy
   ```
   （Stripe の 3 つはダミーで構いません。ログインと Drive 同期には使いません。購入は `PURCHASES_ENABLED="false"` のため行われません）
3. 起動
   ```
   VITE_PREMIUM_ENABLED=true npm run build
   npx wrangler d1 migrations apply slides-db --local
   npx wrangler dev --local
   ```
   → `http://localhost:8787/art-slide/account` を開く（このローカル版では画面にアカウント画面が出ます）
4. 確認用に、**同じ Google アカウントで別のブラウザ（または別のパソコン・スマホ。スマホは同じ Wi-Fi の `http://<PCのIP>:8787` では Google 側の登録が必要なため、別ブラウザのプロファイルで代用可）**を用意する

### 5-2. テスト項目（上から順に。結果を記録してください）

| # | 操作 | 期待する結果 | 確認方法 |
|---|---|---|---|
| 1 | アカウント画面で「Googleでログイン」 | ログイン後、名前と「無料プラン」が出る。「Googleドライブ同期」の欄が出る | 画面 |
| 2 | ART SLIDE を 2〜3 回クリアして、ベスト記録を作る | 端末に記録がある | F12 → Application → Local Storage → `artslide:save` の `counters` `records` |
| 3 | 「同期をオンにする」 | Google の許可画面が出る。要求は **「Google ドライブ内のアプリ専用の設定データの表示と管理」だけ**（My Drive 全体ではない） | 許可画面の文言 |
| 4 | 許可して戻る | 「◯時◯分に同期しました」と出る | 画面 |
| 5 | Drive にファイルができたか | F12 → Network → フィルタ `googleapis` → `files?spaces=appDataFolder…`（200）と `…?alt=media`（200）、アップロードの POST（200）。**Response に自分の記録の JSON**（`schema`・`counters`・`records`）が見える。**メールアドレス・Stripe・契約の情報が入っていない** | Network タブ |
| 6 | アプリが Drive 上で見えない領域にあること | https://drive.google.com → 右上の歯車 → 設定 → **アプリの管理** に `ART SLIDE` が出て「非表示のアプリデータ」の容量がある。**マイドライブにはファイルが出ない** | Drive の画面 |
| 7 | 許可の範囲 | https://myaccount.google.com/connections → ART SLIDE → アクセス権が **Drive の非表示データのみ** | Google アカウント |
| 8 | 別ブラウザで同じアカウントでログイン → 同期オン | **手順 2 の記録が復元される**（クリア回数・ベスト）。ブラウザ A で作った分に、B 自身の分が足される | `artslide:save` の `completed` |
| 9 | ブラウザ B でも 1 回クリアして「今すぐ同期」→ ブラウザ A で「今すぐ同期」 | A にも B の記録が反映。**クリア回数が二重に増えない**（A の数 + B の数のちょうど合計） | `completed` |
| 10 | 同期を 2 回続けて押す | 数字が変わらない | `completed` |
| 11 | 開発者ツール → Network → **Offline** にして 1 回クリア → Online に戻す | オフライン中も遊べて記録が残る。オンラインに戻ると**自動で同期**（数十秒以内） | 画面・`completed` |
| 12 | https://myaccount.google.com/connections で ART SLIDE のアクセスを**削除** → 画面で「今すぐ同期」 | 「Google Drive に再接続してください」と出て、**端末の記録は消えない**。「再接続」で復旧 | 画面・`artslide:save` |
| 13 | ログアウト | 同期が止まる。端末の記録は**そのまま** | `artslide:save` |
| 14 | 別の Google アカウント（テストユーザーに追加）でログイン | 「この端末の記録は別のアカウントと同期されたため、アップロードしません」と出て止まる。「この端末の記録をこのアカウントで使う」を押すまで**何も送られない** | 画面・Network に POST が出ない |
| 15 | 同期をオン時、許可画面で**別の Google アカウント**を選んでみる | 許可画面は、ログイン中のアカウントを最初に提示する（ヒント指定）。別のアカウントを選んだ場合は、そのアカウントの Drive に保存される点を把握しておく | 許可画面 |
| 16 | 「同期をオフにする」 | Drive へのアクセスが取り消される（7 の画面から ART SLIDE のアクセスが消える）。**端末の記録と Drive 上のファイルは残る** | 画面・Google アカウント |
| 17 | Drive の非表示データを手動で削除（6 の画面 → オプション → 非表示のアプリデータを削除）→ 再度同期オン | 端末の記録から Drive に**再作成**される（端末が正） | Network・Drive |

**合格の目安:** 1〜14 がすべて期待どおり。15 は挙動の把握が目的。

### 5-3. うまくいかないとき

| 症状 | 原因の例 |
|---|---|
| 許可画面が出ない・すぐ閉じる | 「承認済みの JavaScript 生成元」に `http://localhost:8787` が無い／ポップアップがブロックされている |
| `redirect_uri_mismatch` | リダイレクト URI に `http://localhost:8787/api/auth/callback` が登録されていない |
| 「アクセスをブロック: このアプリは…」 | OAuth 同意画面が「テスト」で、そのアカウントがテストユーザーに入っていない |
| 403 / `accessNotConfigured` | Google Drive API が有効になっていない |
| 同期が `error` のまま | Network タブで `googleapis` への応答コードを確認。401/403＝許可の問題、5xx/0＝一時的（自動で再試行） |

### 5-4. 結果の報告

上の表の番号ごとに「OK / NG（画面のスクリーンショットか Network のレスポンス）」を送ってください。NG があれば、原因を調べて修正します。
