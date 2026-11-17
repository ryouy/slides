# ART SLIDE Premium: setup（Google ログイン + Stripe 月額 ¥200 + Google ドライブ同期）

> デプロイの前後の確認・復旧・本物の Google での検証手順は [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md) にあります。

**`VITE_PREMIUM_ENABLED` は、下の手順がすべて終わり、テストモードで購入・解約まで確認できるまで本番で `true` にしないでください。** 未設定のままなら、サイトはこれまでの静的サイトと同じ動きです（ロックも Premium のリンクも出ず、API も呼びません）。

## 仕様（正式）

| | Free | Premium（月額 ¥200・税込・自動更新） |
|---|---|---|
| 絵画 | 固定の 40 点（`src/premium/entitlement.ts` の `FREE_ARTWORK_IDS`。全テーマ・全時代から選定。この一覧は自動では変わりません） | 登録済みの全 404 点（今後追加される作品も、一覧に入れない限り自動で Premium の対象） |
| 盤面 | レベル 5 まで | レベル 7 まで（現在の最大） |
| 広告 | あり | なし（枠も余白も出さない） |
| デイリーパズル | 全員が利用可 | 全員が利用可 |
| ログイン・記録・Google ドライブ同期 | 任意・無料 | 同じ |

## 構成

| 役割 | 場所 |
|---|---|
| 画面 | React（`src/premium/`, `src/account/`, `src/sync/`, `src/legal/`）。プランの判定は常にサーバーの答えが元で、ブラウザのフラグは信用しません |
| API | Cloudflare Worker（`worker/`）。`/api/*` だけを処理し、他のリクエストは従来どおり静的ファイルが返ります（`wrangler.jsonc` の `run_worker_first`） |
| DB | Cloudflare D1 `slides-db`（`migrations/0001_init.sql`）。保存するのは「誰か（Google の `sub`・表示名）」「Stripe の顧客ID」「契約状態」「ログインセッション（Cookie のハッシュ）」だけ。**プレイ記録・メールアドレス・カード情報は保存しません** |
| 決済 | Stripe Checkout / Billing / Customer Portal（カード情報は Stripe だけが扱います）。購入ページへはリダイレクトで移るため、公開可能キー（`pk_...`）は不要です |
| 記録の同期 | Google ドライブの `appDataFolder`（課金とは完全に別の仕組み。契約状態は Drive に保存しません） |

## API

| パス | 役割 |
|---|---|
| `GET /api/config` | 何が設定済みか（`auth` / `billing` / `purchases`）と公開の OAuth クライアント ID。秘密は返しません |
| `GET /api/auth/google` → `GET /api/auth/callback` | Google ログイン（Authorization Code + PKCE(S256)、state と nonce を署名付き短命 Cookie で検証、ID トークンの iss / aud / exp / nonce を確認、スコープは `openid profile` のみ。アドレスごとに 10 分 40 回まで） |
| `POST /api/auth/logout` | ログアウト（同一サイトからのリクエストのみ） |
| `GET /api/me`, `GET /api/billing/status[?refresh=1]` | ログイン状態とプラン。契約期間が切れた行は Stripe に問い合わせ直して補正します |
| `POST /api/billing/checkout` | Stripe Checkout を開始（要ログイン・`PURCHASES_ENABLED=true`。すでに契約があれば 409。1 時間 10 回まで） |
| `POST /api/billing/portal` | 支払い方法の変更・解約（Customer Portal） |
| `POST /api/account/delete` | アカウント削除（進行中の契約を先に解約し、失敗したら削除しません） |
| `POST /api/stripe/webhook` | Stripe からの通知（署名検証・重複排除・契約状態の同期） |

セッション Cookie は `__Host-slides_session`（Secure / HttpOnly / SameSite=Lax）。状態を変える API は、同一サイトの Origin（または `Sec-Fetch-Site: same-origin`）を要求します（CSRF 対策）。CORS は許可していません。

## 契約状態とプラン

| Stripe の状態 | Premium |
|---|---|
| `active` / `trialing` | 利用可（更新の通知が遅れても 2 日は猶予） |
| `past_due`（支払い失敗） | すでに支払い済みの期間が残っている間だけ |
| `canceled` | **契約終了**＝利用不可（ポータルで解約すると、支払い済みの期間の終わりまでは `active` + `cancel_at_period_end`＝「解約予約」で利用でき、期間が終わって初めて `canceled` になります。運営者が即時解約した場合は、その時点で終了します） |
| `unpaid` / `incomplete` / `incomplete_expired` / `paused` | 利用不可 |

Checkout 完了画面を根拠に解放はしません。解放は Webhook（または `refresh=1` による Stripe への再確認）で D1 に記録された契約状態だけが根拠です。Webhook は常に Stripe から最新の契約を取得し直して保存するため、順序が入れ替わった通知でも古い状態を上書きしません。Stripe の顧客はログインユーザーと 1 対 1 で固定され、別の顧客の契約が別のアカウントに付くことはありません。処理に失敗したときは 500 を返し（Stripe が再送）、成功するまで「処理済み」に記録しません。

## Google ドライブ同期

- 既定はオフ。アカウント画面の「同期をオンにする」を押したときだけ、Google が **`drive.appdata`**（このアプリ専用の非表示フォルダ）への許可を別途たずねます。ログインだけでは Drive にアクセスしません。
- アクセストークンはブラウザのメモリにだけ置き（約 1 時間）、サーバーにも保存領域にも送りません。更新トークンはどこにも保存しません。
- 同期するのは、クリア済みの絵画と盤面サイズごとのベスト（時間・手数）・クリア回数・日付・直近の履歴（最大 200 件）だけです。設定や進行中のパズル、契約状態は含みません。
- 競合の解決は「足すか良くするだけ」: ベストは小さいほうを採用、クリア回数は**端末ごと**に持って合算（同じ記録を二重に数えません）、履歴は和集合です。何度同期しても、複数端末で同時に同期しても同じ結果に収束します。
- 同期の前に、この端末の記録を `artslide:save:before-sync` にコピーして残します（初回のみ）。同期はどの記録も削除しません。
- オフライン・失敗時は端末の記録だけで遊べて、あとで自動的に再試行します（30 秒 → 2 分 → 10 分、オンライン復帰時にも）。
- ログアウト: 同期は止まり、トークンを忘れます。端末の記録は消えません。別のアカウントでログインしたときは、この端末の記録が別アカウントと同期されたものである場合に限り、そのアカウントの Drive へは**自動ではアップロードせず**、「この端末の記録をこのアカウントで使う」を選ぶまで止まります（記録の混在防止）。
- 同期をオフ: Drive へのアクセスを取り消します。端末の記録と Drive 上のファイルはそのまま残ります（Drive 側のデータは、Google ドライブの「設定 → アプリの管理」から削除できます）。
- Drive のファイルが新しいバージョンのアプリで書かれたものだった場合（`schema` が新しい）は、何も上書きしません。

## 特定商取引法に基づく表記・利用規約・プライバシーポリシー

`/commerce`（特定商取引法に基づく表記）、`/terms`、`/privacy`、`/contact` は、日本語と英語で用意してあります。**運営者の実際の情報は、`src/legal/operator.ts` に、運営者が入力します。架空の情報は入れていません。**未入力の項目は黄色の【未設定】で表示され、必須項目（販売事業者名・運営統括責任者・所在地と電話番号の扱い・メールアドレス・消費税の扱い・制定日）がそろうまで、購入ボタンは使えません（画面側）。サーバー側の `PURCHASES_ENABLED` も `true` にするまで、Checkout は 503 を返します。

**入力・判断が必要な項目の一覧、住所・電話番号を請求時開示にできる条件、根拠（消費者庁の資料）は [LEGAL-CHECKLIST.md](LEGAL-CHECKLIST.md) にあります。**

## 必要な値

| 名前 | 種類 | 取得元 |
|---|---|---|
| `SITE_URL` | 変数（`wrangler.jsonc` の `vars`、設定済み） | `https://slides.ryouy.workers.dev` |
| `PURCHASES_ENABLED` | **Secret**（ダッシュボード。未設定＝無効） | 購入を受け付けるときだけ `true`（[STRIPE-TEST.md](STRIPE-TEST.md)） |
| `ALLOW_LIVE_PAYMENTS` | Secret（未設定＝実決済は不可） | 本番の実際の決済を始めるときだけ `true` |
| `SESSION_SECRET` | Secret | 自分で作る長いランダム文字列（Mac のターミナルで `openssl rand -base64 48`） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Secret | Google Cloud（手順 2） |
| `STRIPE_SECRET_KEY` | Secret | Stripe（手順 3）。**テストは `sk_test_...`、本番は `sk_live_...`** |
| `STRIPE_PRICE_ID` | Secret | 月額 ¥200 の価格 ID（**`price_...`**。`prod_...` は商品 ID で不可。不可の値は Checkout が拒否します） |
| `STRIPE_WEBHOOK_SECRET` | Secret | Webhook の署名シークレット（`whsec_...`。API のデプロイ後に作成） |
| `VITE_PREMIUM_ENABLED` | **ビルド時**の環境変数 | `true` で Free/Premium の制限と購入導線を有効化（**最後に**設定） |

## 手順（画面の操作つき）

### 1. Cloudflare：D1 のテーブルを作る
D1 `slides-db` は作成済みで、`wrangler.jsonc` に接続済みです。

1. https://dash.cloudflare.com にログイン → 左メニュー「Storage & databases」→「D1 SQL database」→ `slides-db` をクリック
2. 上のタブ「Console」を開く
3. このリポジトリの `migrations/0001_init.sql` の中身を**すべてコピーして**入力欄に貼り付け、「Execute」を押す（5 つのテーブルを作る `CREATE TABLE` だけです。既存のデータは消えません）
4. 「Tables」タブに `users` `subscriptions` `stripe_events` `sessions` `rate_limits` が並べば完了

（Mac のターミナルが使える場合は `npx wrangler login` のあと `npx wrangler d1 migrations apply slides-db --remote` でも同じです。）

**Worker 名の確認:** 「Workers & Pages」の一覧で、このサイトの名前が `wrangler.jsonc` の `"name": "slides"` と同じか確認してください。違う場合は `wrangler.jsonc` の `name` をその名前に直します（違うままだとビルドが失敗しますが、公開中のサイトはそのまま動き続けます）。

### 2. Google Cloud：ログインと Drive 同期

1. https://console.cloud.google.com/ を開き、上のプロジェクト選択から「新しいプロジェクト」を作成（名前は `slides` など）
2. 左メニュー「API とサービス」→「ライブラリ」→「Google Drive API」を検索して「有効にする」
3. 左メニュー「API とサービス」→「OAuth 同意画面」（新しい画面では「Google Auth Platform」）→「開始」
   - アプリ名 `ART SLIDE`、ユーザーサポートメール＝自分のメール、対象＝「外部」、連絡先メールを入力して作成
   - 「データへのアクセス」→「スコープを追加または削除」で `openid`、`.../auth/userinfo.profile`、`.../auth/drive.appdata` にチェック → 保存
   - 「対象」→ 公開ステータスは最初は「テスト」のまま、「テストユーザー」に自分の Google アカウントを追加。本番では「本番環境に公開」にします（これらのスコープは機密性が低いため、審査は通常不要です）
   - 「ブランディング」→ プライバシーポリシーのリンクに `https://slides.ryouy.workers.dev/privacy`、利用規約に `https://slides.ryouy.workers.dev/terms`。**注意:** `workers.dev` は共有ドメインのため、Google が「承認済みドメイン」として受け付けない場合があります。その場合は独自ドメインが必要です
4. 左メニュー「認証情報」→「認証情報を作成」→「OAuth クライアント ID」→ アプリケーションの種類「ウェブ アプリケーション」
   - 「承認済みの JavaScript 生成元」: `https://slides.ryouy.workers.dev`（Drive 同期に必要）、ローカル確認用に `http://localhost:8787`
   - 「承認済みのリダイレクト URI」: `https://slides.ryouy.workers.dev/api/auth/callback`、ローカル確認用に `http://localhost:8787/api/auth/callback`
   - 「作成」を押すと表示される **クライアント ID** と **クライアント シークレット** をコピー（シークレットは他人に見せない）

### 3. Stripe：月額 ¥200（まずテストモード）

1. https://dashboard.stripe.com/ にログインし、「テストモード」をオンにする（画面に「テスト環境」と出ます）
2. 「商品カタログ」→「商品を追加」: 名前「ART SLIDE Premium」、価格「¥200」、「定期的」・「月次」、通貨 JPY。税込で表示するなら「税の扱い」を「税込み」に。保存後、価格の `price_...` で始まる **価格 ID** をコピー
3. 「設定」→「Billing」→「カスタマーポータル」: 「サブスクリプションをキャンセルする」（「期間の終了時にキャンセル」）と「支払い方法の更新」をオンにして保存
4. 「開発者」→「API キー」→ **シークレットキー（`sk_test_...`）** の「表示」を押してコピー（公開可能キーは不要）
5. **API をデプロイしたあとで**「開発者」→「Webhook」→「エンドポイントを追加」: URL に `https://slides.ryouy.workers.dev/api/stripe/webhook`、イベントは `checkout.session.completed` / `customer.subscription.created` / `customer.subscription.updated` / `customer.subscription.deleted` / `invoice.paid` / `invoice.payment_failed` を選んで追加。作成後に表示される **署名シークレット（`whsec_...`）** をコピー

### 4. Secrets を Cloudflare に登録

1. 「Workers & Pages」→ `slides` →「Settings」→「Variables and Secrets」→「Add」
2. 種類を **Secret** にして、名前と値を 1 つずつ登録: `SESSION_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET`
3. 「Deploy」で反映

（ターミナルなら `npx wrangler secret put SESSION_SECRET` のように 1 つずつ。）**値を Git にコミットしないでください**（`.dev.vars` は `.gitignore` 済み）。

### 5. 公開の順番（安全のため段階的に）

1. このコードをデプロイ。まだ何も有効にしない。`https://slides.ryouy.workers.dev/api/config` を開くと `{"auth":false,"billing":false,"purchases":false}` になります（サイトは従来どおり）
2. 手順 1（テーブル作成）→ 手順 4（Secrets）。`/api/config` が `{"auth":true,"billing":true,"purchases":false,"googleClientId":"..."}` になれば OK。**この時点でもサイトの見た目は変わりません**
3. 手順 3 の 5 番（Webhook）を作成し、`STRIPE_WEBHOOK_SECRET` を登録
4. ローカルで通しテスト（下記）。テストカード `4242 4242 4242 4242`（成功）、`4000 0000 0000 0341`（支払い失敗）
5. `src/legal/operator.ts` に運営者情報を入力、Cloudflare の Secret `PURCHASES_ENABLED` を `true`（本番のキーを使うなら `ALLOW_LIVE_PAYMENTS` も `true`）、Cloudflare の「Settings → Build → Variables and secrets」に **ビルド変数** `VITE_PREMIUM_ENABLED=true` を追加して再デプロイ
6. Stripe を本番モードに切り替え、本番の `sk_live_...`・価格 ID・Webhook（本番用に作り直し）の値に差し替える

## ローカルで動かす（購入テスト）

```
cp .dev.vars.example .dev.vars        # 値を埋める（SITE_URL=http://localhost:8787、Stripe はテストの値）
VITE_PREMIUM_ENABLED=true npm run build
npx wrangler d1 migrations apply slides-db --local
npx wrangler dev                       # http://localhost:8787
stripe listen --forward-to localhost:8787/api/stripe/webhook   # Stripe CLI（Webhook の署名シークレットが表示される）
```

テスト: `npx vitest run`（`worker/worker.test.ts` は SQLite 上で本物のマイグレーションを実行し、Google・Stripe は偽の応答で検証）。`npx playwright test` の `e2e/premium.spec.ts` / `e2e/sync.spec.ts` は API・Google・Drive を偽物に差し替えて画面の挙動を検証します。

## 制限のしくみと、設計上の限界

| 守るもの | どう守るか | 限界 |
|---|---|---|
| Premium 作品（Free 以外の 364 点）の**高解像度画像** | Worker が `/artworks/<id>.webp` を配信し、`PREMIUM_ENFORCED=true` のとき、契約が有効なアカウント（D1 の記録）にだけ返す。Free 作品・今日のデイリー・サムネイル・共有画像は誰でも取得可。エラー時は拒否側（503） | **サムネイル（約 480px）は公開**です（ギャラリーに表示するため）。小さな画像でパズルを作ることは技術的に可能です |
| 盤面レベル 6・7 | 画面と操作の制限（ゲームのコードは静的ファイル） | ブラウザの開発者ツールで改造すれば遊べます（画像の保護とは別の話で、サーバー側では止められません） |
| 広告の非表示・自分の写真 | 画面側の制限 | 同上。ただし写真は端末内だけの機能で、サーバーの資源を使いません |
| Premium の判定そのもの | サーバーの記録だけ。ブラウザに保存した値や、開発用の切り替えスイッチ（`slides:dev-…`）は**本番ビルドに含まれません**（`check-deploy.mjs` が確認） | — |

`PREMIUM_ENFORCED` は **Secret**（ダッシュボード）で、未設定なら画像は従来どおり全員に配信されます。`VITE_PREMIUM_ENABLED`（ビルド変数）・`PURCHASES_ENABLED`（Secret）と**同時に**有効にしてください（先に画像だけ保護すると、制限を知らない Free 利用者の画面で画像が出なくなります）。
