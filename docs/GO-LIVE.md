# 一般販売の開始と停止（Premium 月額 ¥200・税込）

現状: **販売停止中**（`PURCHASES_ENABLED`・`ALLOW_LIVE_PAYMENTS`・`PUBLIC_SALES`・`PREMIUM_ENFORCED`・`VITE_PREMIUM_ENABLED` はすべて未設定）。

## 仕組み（購入が始まるための条件。1つでも欠けると購入は拒否される）
| 条件 | 設定 | 欠けたとき |
|---|---|---|
| 購入機能 | Secret `PURCHASES_ENABLED` = `true` | 503 |
| 本番キーの許可 | Secret `ALLOW_LIVE_PAYMENTS` = `true`（`rk_live_` / `sk_live_` を使うとき） | 503 `live_key_not_allowed` |
| 誰が買えるか | Secret `PUBLIC_SALES` = **`open`**（ちょうどこの文字列のみ。`true`・`1`・`OPEN` などは「閉」として扱う）。それ以外は `PURCHASE_ALLOWLIST`（未設定なら全員拒否） | 403 `not_allowed` |
| 画面に購入導線を出す | ビルド変数 `VITE_PREMIUM_ENABLED` = `true` | 購入導線・ロックは出ない（`/art-slide/premium?tester=1` だけ例外） |
| 高解像度画像の保護 | Secret `PREMIUM_ENFORCED` = `true`（`VITE_PREMIUM_ENABLED` と同時） | 画像は従来どおり全員に配信 |
| Stripe の設定 | キー・Price・Webhook 署名シークレット・ポータル | 503 など |

## 開始前の確認（読み取り専用・課金なし）
1. `STRIPE_SECRET_KEY=rk_live_… STRIPE_PRICE_ID=price_… npx vite-node scripts/check-stripe.ts` — 本番キー・¥200/月の価格の一致。
2. `STRIPE_SECRET_KEY=rk_live_… STRIPE_PRICE_ID=price_… npx vite-node scripts/check-stripe-live.ts` — キーの読み取り権限、Webhook 送信先（URL・有効・必須イベントの購読）、ポータルで「期間末に解約」できること。出力の最後の **書き込み権限**（Customers / Checkout Sessions / Customer portal / Subscriptions）は、ダッシュボードで目視確認。
3. Stripe ダッシュボード: Webhook 送信先の署名シークレットが Cloudflare の `STRIPE_WEBHOOK_SECRET` と同じ（本番用）こと。
4. 法的ページ（`/commerce` `/terms` `/privacy`）が表示され、フォーム・メールの窓口が機能すること。

## 開始の手順（この順で）
1. Cloudflare の Secret を追加: `PURCHASES_ENABLED=true`、`ALLOW_LIVE_PAYMENTS=true`、`PUBLIC_SALES=open`（画面は変わらない）。
2. ビルド変数 `VITE_PREMIUM_ENABLED=true` と Secret `PREMIUM_ENFORCED=true` を設定し、再デプロイ（Settings → Build の変数は、ビルドし直して初めて効く）。
3. `/api/config` が `purchases:true`、サイトに「Premium」の導線とロックが出ることを確認。
4. すぐに Stripe ダッシュボードで、最初の購入・Webhook 配信（2xx）を見守る。

## 問題が起きたときの停止手順（上ほど速く、影響が小さい）
1. **購入だけを止める（数秒）**: Secret `PURCHASES_ENABLED` を `false` にする（または削除）。新規の購入は 503、**既存の契約者の Premium・ポータル・解約は影響なし**。
2. **誰も買えないようにする**: Secret `PUBLIC_SALES` を削除（許可リストが無ければ全員拒否）。
3. **本番課金そのものを止める**: Secret `ALLOW_LIVE_PAYMENTS` を削除。
4. **Premium の画面とロックを消す**: ビルド変数 `VITE_PREMIUM_ENABLED` を削除して再デプロイし、Secret `PREMIUM_ENFORCED` を削除（全作品が再び全員に開く）。
5. **Worker のコードを戻す**: Cloudflare → `slides` → Deployments で直前のバージョンに戻す。
- 課金してしまった利用者への対応: Stripe ダッシュボードで返金・解約（返金は手動）。`scripts/check-no-open-subscriptions.ts` で、課金が続く契約が残っていないか確認できる。


## 開始後・停止後の確認（読み取り専用）
- 開始前／停止後: `node scripts/check-launch.mjs --expect stopped`
- 開始後: `node scripts/check-launch.mjs --expect live`（`/api/config` が `purchases:true`、Premium の「準備中」が消え、同意つきの購入ボタンが出る、Premium 作品の原寸画像が未ログインで 403、サムネイルは公開のまま、ART/WORD/BIG が動く、など）。購入・ログインはしません。


## 実際に起きたこと（教訓）
- **Build 変数（`VITE_PREMIUM_ENABLED`）は、保存しただけでは効かない。** 新しいビルドが走って初めて画面に反映される。Cloudflare の「Retry build」が使えないときは、リポジトリに実際の変更（この文書の更新など）をプッシュするとビルドが走る。
- **`PREMIUM_ENFORCED` は、画面側の再ビルドが終わってから `true` にする。** 先に有効にすると、古いビルドの画面にはロック表示がないまま Premium 作品の原寸画像だけが 403 になり、画像の読み込みエラーが出る。
- 順序: ①`VITE_PREMIUM_ENABLED=true` を保存 → ②再ビルド完了を確認 → ③`PREMIUM_ENFORCED=true` → ④`PUBLIC_SALES=open`・`ALLOW_LIVE_PAYMENTS=true` → ⑤最後に `PURCHASES_ENABLED=true`。

## Stripe のテスト環境と本番環境は別世界（顧客・契約を分けて保存）
- テストキーで作った顧客・契約の ID は、本番キーからは「存在しない」（`resource_missing`）。以前の版は顧客 ID を 1 列（`users.stripe_customer_id`）にしか保存しておらず、テストで保存した ID を本番キーで使って `server_error` になった。
- 今は **モードごと**に保存する（`migrations/0002_stripe_modes.sql`: `stripe_customers` と `stripe_subscriptions`、`livemode` 1=本番・0=テスト）。同じ Google アカウントでも、テストと本番の顧客・契約は独立。
- 古い列・テーブル（`users.stripe_customer_id`、`subscriptions`）は **変更も削除もしない**。初めて必要になったときに Stripe に問い合わせて分類する: その環境に存在する→その環境のもの、「存在しない」→もう一方の環境のものとして記録（残す）。
- 保存済みの顧客が Stripe に存在しない場合は、黙って新規作成せず `503 customer_unavailable`（人の確認が必要）。
- Webhook は `livemode` が使用中のキーと違うイベントを確認応答だけして適用しない。
- マイグレーション `0002` は適用しなくても、Worker が初回のリクエストで同じ空のテーブルを作る（既存データには触れない）。`npx wrangler d1 migrations apply slides-db --remote` で適用しておくと記録が揃う。
