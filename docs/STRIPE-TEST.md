# Stripe テスト決済 → Premium 反映までの確認手順

**目的:** 月額 ¥200 のサブスクリプションを、**Stripe のテストモードだけ**で、購入 → Webhook → D1 → `/api/me` の Premium 判定まで通して確認します。
**前提（変えません）:** `VITE_PREMIUM_ENABLED` は未設定のまま（サイトの見た目は一切変わりません）／Free は固定 40 点・レベル 5 まで、Premium は全 404 点・レベル 7 まで。
画面には購入ボタンが出ないので、**ブラウザの開発者ツールの Console から API を直接呼んで**確認します。

---

## 1. 実装の最終確認（購入から Premium 反映までの流れ）

```
[Console] POST /api/billing/checkout
   ├ ① ログイン（Cookie）と、同一サイトからのリクエストかを確認
   ├ ② PURCHASES_ENABLED=true か（それ以外は 503 purchases_disabled）
   ├ ③ STRIPE_PRICE_ID が price_… か／キーが sk_… か／本番キーなら ALLOW_LIVE_PAYMENTS=true か
   ├ ④ 回数制限（1 時間 10 回）／D1 に有効な契約があれば 409 already_subscribed
   ├ ⑤ Stripe から価格を読み、「¥200・JPY・月次・有効・キーと同じモード」でなければ 503（何も作らない）
   ├ ⑥ Stripe の顧客を作成（アカウントと 1 対 1 で固定。metadata に user_id）
   ├ ⑦ Stripe 側の契約を確認：有効/支払い保留中の契約があれば 409（Webhook が遅れていても二重購入を防ぐ）
   ├ ⑧ 開きっぱなしの古い支払いページがあれば失効させる（同時に 2 つ払えない）
   └ ⑨ Checkout を作成して URL を返す
[Stripe の支払いページ] テストカードで支払い
[Stripe → Webhook] POST /api/stripe/webhook
   ├ 署名検証（5 分以内・不一致は 400）／同じ event は 1 回だけ処理（stripe_events）
   ├ 常に Stripe から最新の契約を取り直して D1 の subscriptions に保存
   └ すでに有効な別の契約があれば上書きしない（二重払いの記録：ログに duplicate_subscription）
[Console] GET /api/me → premium: true（D1 の契約状態で判定。Checkout の完了画面は根拠にしない）
```

今回の精査で**修正した 4 点**（いずれもローカルでテスト済み）:

| # | 問題 | 修正 |
|---|---|---|
| 1 | 即時解約（`canceled`）のあとも、支払い済み期間のあいだ Premium が続いた | `canceled` は**契約終了**＝Free。ポータルでの解約は期間末まで `active` のまま（支払い済みの期間は失われません） |
| 2 | 二重購入の防止が D1 の記録だけで、Webhook の遅れや同時の Checkout をすり抜けた | Stripe 側の契約も確認／開いている支払いページを失効／二重の契約は先の契約を残して記録 |
| 3 | 価格がキーのモードや ¥200/月と合っているか確認していなかった | 価格を Stripe から読んで照合。違えば Checkout を作らず 503。**本番キーは `ALLOW_LIVE_PAYMENTS=true` が無い限り拒否** |
| 4 | `PURCHASES_ENABLED` が `wrangler.jsonc` と Secret で二重になり、切り替えにコードのプッシュが必要だった | `wrangler.jsonc` から外し、**ダッシュボードの Secret だけ**で即時に切り替え（**この変更はプッシュ後に有効**） |

---

## 2. 購入機能を一時的に有効化する前の確認（実際の決済が発生しないことの確認）

実際のお金が動かない理由は**重なっています**。それぞれ確認してください。

| 安全装置 | 内容 |
|---|---|
| テストモードのキー | `sk_test_…` では、本物のカードは**拒否される**（Stripe の仕様） |
| 本番キーの拒否 | `ALLOW_LIVE_PAYMENTS` が未設定なら、`sk_live_…` では Checkout を開始しません |
| 価格とキーの照合 | テストの価格にテストのキー、¥200・月次のものだけが通ります |
| 画面に導線なし | `VITE_PREMIUM_ENABLED` 未設定のため、一般の利用者には購入ボタンが出ません |

### 2-1. キーと価格が対応しているか（自分のパソコンで、読み取りだけ）

Mac のターミナルで、このリポジトリのフォルダから実行します（**キーは自分で入力し、画面には出ません**）。

```
STRIPE_SECRET_KEY=sk_test_（ダッシュボードの値） STRIPE_PRICE_ID=price_（価格 ID） npx vite-node scripts/check-stripe.ts
```

合格の表示:

```
  key mode ........ test (no real payments)   [sk_test_…]
  price id ........ price_1Abc…
  price mode ...... test
  active .......... true
  amount .......... 200 JPY / 1 month
  ✓ price matches the key — test mode: no real money can move
```

| 表示 | 意味と対処 |
|---|---|
| `key mode … LIVE` | **本番キーです。中止してください**（テストモードのキーに差し替える） |
| `does not exist for this key` | 価格とキーのモードが違う（テストの価格はテストのキーでだけ使えます） |
| `STRIPE_PRICE_ID … prod_…` | 商品 ID を入れています。価格の `price_…` に直す |
| `price_wrong_amount` / `price_not_recurring` | 金額が ¥200 でない／月次でない価格です。正しい価格を作る |

### 2-2. Stripe ダッシュボード（テストモード）

1. 画面上部に **「テスト環境」** と出ている（右上のトグルがオン）
2. 開発者 → Webhook に、`https://slides.ryouy.workers.dev/api/stripe/webhook` があり、イベントに `checkout.session.completed` / `customer.subscription.created|updated|deleted` / `invoice.paid` / `invoice.payment_failed` が入っている（Stripe CLI の送信テストで 200 を確認済み）
3. 設定 → Billing → カスタマーポータルで、「サブスクリプションのキャンセル（期間終了時）」がオン

### 2-3. 今の本番の状態

`https://slides.ryouy.workers.dev/api/config` が `"purchases":false` であること。

---

## 3. 購入機能を一時的に有効化する手順

**先に必要:** この修正（`PURCHASES_ENABLED` を `wrangler.jsonc` から外す）を本番に反映するため、**プッシュの許可**をください。反映後に次へ進みます。

1. Cloudflare → Workers & Pages → `slides` → Settings → **Variables and Secrets** で、`PURCHASES_ENABLED` が **Secret** として 1 つだけあり、値が `false` であることを確認（無ければ作る）
2. `STRIPE_SECRET_KEY` が `sk_test_…` であることを再確認（**`ALLOW_LIVE_PAYMENTS` は作らない**）
3. `PURCHASES_ENABLED` の値を **`true`** に変更 → **Deploy**
4. `https://slides.ryouy.workers.dev/api/config` を開き、`"billing":true,"purchases":true` になっていることを確認
5. **テスト中は、他の人にこの API の存在を伝えない・テストは短時間で終える**（購入ボタンは出ていませんが、ログインして API を直接呼べば、テストモードの Checkout は誰でも作れます。実際の請求にはなりません）

---

## 4. テスト手順（Console から実行）

ブラウザ（Chrome）で `https://slides.ryouy.workers.dev/` を開き、F12 → **Console** に貼り付けて実行します。**初回は「貼り付けを許可」の入力を求められることがあります。**

**確認用の道具:**
- 現在の状態: `fetch('/api/me').then(r=>r.json()).then(console.log)`
- D1 の中身: Cloudflare → D1 → `slides-db` → Console →
  `SELECT u.id, u.stripe_customer_id, s.stripe_subscription_id, s.status, datetime(s.current_period_end,'unixepoch') AS period_end, s.cancel_at_period_end FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id;`
- Webhook の履歴: Stripe → 開発者 → Webhook → エンドポイント →「イベント」（200 が並ぶ）
- Worker のログ: Cloudflare → `slides` → Logs

### T0. ログイン（購入前）
1. `https://slides.ryouy.workers.dev/api/auth/google?return=/api/me` を開き、Google でログイン
2. **期待:** `{"signedIn":true,…"premium":false,"status":null,…}`

### T1. 決済の失敗（Premium にならないこと）
1. Console: `fetch('/api/billing/checkout',{method:'POST'}).then(r=>r.json()).then(j=>{console.log(j);location.href=j.url})`
2. Stripe の支払いページに **¥200 / 月** と出ることを確認。カード番号 **`4000 0000 0000 0002`**（拒否されるカード）、有効期限は未来の日付、CVC は任意の 3 桁
3. **期待:** 「カードが拒否されました」と出て、支払いは完了しない
4. 元のサイトに戻り `/api/me` → **`premium:false`**。D1 の `subscriptions` に行が無い（または `status` が `incomplete`）
   - 補足: 3D セキュア認証が必要なカード `4000 0027 6000 3184` で認証を「失敗」にしても、同じく Premium にならない

### T2. 決済の成功（Premium になること）
1. T1 の Console を再実行して支払いページを開く
2. カード **`4242 4242 4242 4242`**、有効期限は未来、CVC 任意、メールは自分のもの → 支払う
3. **期待:**
   - `https://slides.ryouy.workers.dev/art-slide/premium?checkout=success` に戻る（画面は従来のままで構いません）
   - Stripe → Webhook のイベントに `checkout.session.completed` と `customer.subscription.created`（と `invoice.paid`）が **200**
   - D1: `status = active`、`period_end` が約 1 か月後、`cancel_at_period_end = 0`
   - `/api/me` → **`premium:true, status:"active", cancelAtPeriodEnd:false`**
4. Webhook が遅れて `premium:false` のままなら: `fetch('/api/billing/status?refresh=1').then(r=>r.json()).then(console.log)`（Stripe から直接取り直す）→ `premium:true`

### T3. 二重購入の防止
- **(a) 契約中にもう一度購入:** T2 のあとで T1 の Console を実行 → **期待: `409 {"error":"already_subscribed"}`**、Stripe に新しい Checkout は作られない
- **(b) 支払いページを 2 つ開く（契約が無い状態で）:** Console を 2 回続けて実行し、2 つ目の URL を使って支払う。**期待:** 1 つ目の URL を開くと「期限切れ」になる（同時に 2 つは払えない）
- **(c) 二重に契約が作られた場合の保護:** Stripe ダッシュボード → 顧客 → 「サブスクリプションを追加」で、同じ顧客に 2 つ目を作る。**期待:** `/api/me` と D1 は**最初の契約のまま**、Worker のログに `duplicate_subscription` が出る。確認したら、2 つ目を Stripe で**キャンセル**

### T4. 解約（期間末まで Premium が続くこと）
1. Console: `fetch('/api/billing/portal',{method:'POST'}).then(r=>r.json()).then(j=>location.href=j.url)`
2. Stripe のカスタマーポータルで「サブスクリプションをキャンセル」→ 確認
3. **期待:** Webhook `customer.subscription.updated` が 200。D1 の `cancel_at_period_end = 1`。`/api/me` → **`premium:true, cancelAtPeriodEnd:true`**（支払い済みの期間は使える）
4. ポータルに戻り「サブスクリプションを更新しない（解約を取り消す）」→ `/api/me` が `cancelAtPeriodEnd:false` に戻る

### T5. 契約の終了（Free に戻ること）
1. Stripe ダッシュボード → サブスクリプション → 「…」→ **キャンセル →「今すぐ」**
2. **期待:** Webhook `customer.subscription.deleted` が 200。D1 の `status = canceled`。`/api/me` → **`premium:false, status:"canceled"`**
3. 続けて T1 の Console → もう一度購入できる（再加入の確認。T2 と同じ結果）

### T6. 契約更新・支払い失敗（任意・上級）
Stripe CLI（`stripe`）が使える場合のみ。構文は Stripe の最新ドキュメントで確認してください。
- 更新: `stripe subscriptions update sub_…（契約 ID） -d billing_cycle_anchor=now -d proration_behavior=none` → `invoice.paid` が 200、D1 の `period_end` が更新される
- 支払い失敗: ダッシュボードで顧客に支払い方法 `4000 0000 0000 0341`（付与は成功するが、請求は失敗するカード）を追加して既定にし、上の更新を実行 → `invoice.payment_failed` → D1 `status = past_due`。支払い済みの期間が残っていれば `premium:true`、期間が過ぎれば `false`

### T7. アカウント削除
1. Console: `fetch('/api/account/delete',{method:'POST'}).then(r=>r.status)` → **期待: `200`**
2. Stripe の契約が**キャンセル**され、D1 の `users` / `subscriptions` / `sessions` の行が消える（顧客の記録は Stripe に残ります）

---

## 5. テスト終了後に購入機能を無効化する

1. Cloudflare → `slides` → Settings → Variables and Secrets → `PURCHASES_ENABLED` の値を **`false`** に変更（または削除）→ **Deploy**
2. `https://slides.ryouy.workers.dev/api/config` が **`"purchases":false`** であることを確認
3. 自動チェック: `node scripts/check-deploy.mjs https://slides.ryouy.workers.dev --stage 1` → `All checks passed`
4. Stripe（テストモード）で、残っているテストの契約を**キャンセル**
5. テスト用データの掃除（D1 Console）:
   ```
   DELETE FROM users;
   DELETE FROM stripe_events;
   DELETE FROM rate_limits;
   ```
   （`users` を消すと、契約とセッションも連動して消えます）
6. **本番の決済を始める前には**、本番の `sk_live_…` キー・本番の価格 ID・本番の Webhook に差し替え、`ALLOW_LIVE_PAYMENTS=true` を足してください（テストの顧客 ID は本番には存在しないため、手順 5 の掃除が必須です）。そのときも `scripts/check-stripe.ts` で、キーと価格が対応していることを確認します

---

## 6. うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| `503 purchases_disabled` | Secret `PURCHASES_ENABLED` が `true` でない／Deploy していない |
| `503 invalid_price_id` / `invalid_stripe_key` | 価格 ID が `price_…` でない／キーが `sk_…` でない（空白・全角に注意） |
| `503 live_key_not_allowed` | 本番キーが入っています。テストキーに差し替える |
| `503 price_mode_mismatch` | 価格とキーのモード（テスト／本番）が違う |
| `503 price_wrong_amount` / `price_not_recurring` / `price_inactive` | 価格が ¥200・月次・有効でない |
| `409 already_subscribed` / `payment_pending` | すでに契約がある／支払いが未完了（3D セキュアの途中など） |
| 支払ったのに `premium:false` | Webhook が届いていない。Stripe の Webhook 画面でイベントの応答コードを確認（400＝署名シークレットの不一致、503＝`STRIPE_WEBHOOK_SECRET` 未登録）。`/api/billing/status?refresh=1` で取り直せる |
| Webhook が 400 | `STRIPE_WEBHOOK_SECRET` が、そのエンドポイントの署名シークレット（`whsec_…`）と違う。テストの Webhook を作り直した場合は更新が必要 |
| 429 | 1 時間あたりの回数制限。しばらく待つ |
