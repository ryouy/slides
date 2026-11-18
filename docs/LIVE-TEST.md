> **この方針は取り下げました（本番で実カードを使うテストは行わない）。** 検証は Sandbox の統合テスト（`scripts/sandbox-integration.mjs`、`docs/STRIPE-TEST.md`）で行います。一般販売の手順は `docs/GO-LIVE.md`。以下は、許可リストの仕組みの説明としてのみ残してあります。

# 本番 Checkout の限定決済テスト（許可リスト方式）

**目的**: 一般の訪問者には何も見せず、許可リストに入れた自分のアカウントだけが、実カードで ¥200 を1回通し、決済・Webhook・Premium 付与・期間末解約・即時解約までを確かめる。テスト後に継続課金が残らないことを確認する。

## 仕組み
- サーバー（Worker）が、Checkout の作成を `PURCHASE_ALLOWLIST`（Cloudflare **Secret**）に載っているアカウント ID にだけ許す。
  - 未設定・空・不正（ID でない文字列が1つでも混ざる／21 件以上／`*`）→ **全員拒否**。
  - 許可外のアカウント → `403 not_allowed`（Stripe には何も送らない）。未ログイン → 401。`PURCHASES_ENABLED` が false → 503。本番キー（`rk_live_`/`sk_live_`）は従来どおり `ALLOW_LIVE_PAYMENTS=true` も必要。
  - 契約者の「管理・解約」（ポータル）は許可リストの影響を受けない。
- 画面（`VITE_PREMIUM_ENABLED` は無効のまま）: 購入ボタンは、サーバーが `canPurchase:true` と答えたアカウントにだけ出る。他の人には「準備中」の表示だけ。
- `…/art-slide/premium?tester=1` を開いたときだけ、サイトはアカウント情報を問い合わせる（ログイン用リンクと自分のアカウント ID を表示）。それ以外の訪問者のページは API を一切呼ばない。

## 手順（承認後に実施）
1. **アカウント ID を知る**: `https://slides.ryouy.workers.dev/art-slide/premium?tester=1` を開き、「Sign in with Google」でログイン → 画面の **Account ID** をコピー（購入権限は「may not buy」と出るのが正しい）。
2. **許可リストを登録**: Cloudflare → Workers & Pages → `slides` → Settings → Variables and Secrets → **Secret** `PURCHASE_ALLOWLIST` = コピーした ID（複数ならカンマ区切り）。
3. **有効化**（この2つを Secret で追加。どちらも後で必ず削除/false に戻す）: `ALLOW_LIVE_PAYMENTS=true`、`PURCHASES_ENABLED=true`。`https://slides.ryouy.workers.dev/api/config` が `purchases:true` になる。`PREMIUM_ENFORCED` と `VITE_PREMIUM_ENABLED` は触らない。
4. **事前確認**: `STRIPE_SECRET_KEY=rk_live_… STRIPE_PRICE_ID=price_… npx vite-node scripts/check-stripe.ts`（LIVE・¥200/月・価格が一致）。Stripe ダッシュボードで、Webhook 送信先に 9 イベント（`checkout.session.completed`、`customer.subscription.created/updated/deleted/paused/resumed`、`invoice.paid/payment_failed/payment_succeeded`）と本番の署名シークレット、カスタマーポータルで「解約」が有効なことを確認。
5. **購入**: 手順1のページを再読込 → 購入ボタンが出る → 同意にチェック → 決済ページで実カードにより ¥200 を支払う。戻ったページが「確認中」から Premium になる。
   - Stripe ダッシュボード: 支払い成功、サブスクリプション active、Webhook 配信が 2xx。
6. **期間末解約**: サイトの「アカウント → サブスクリプションを管理」（Stripe ポータル）→ 解約。サイトが「○月○日に終了」と表示し、**まだ Premium** であること。Stripe 側で `cancel_at_period_end`、終了日が請求期間の終わりと一致。
7. **即時解約**: Stripe ダッシュボード → サブスクリプション → 「サブスクリプションをキャンセル」→ **即時**。Webhook `customer.subscription.deleted` の後、サイトが**すぐ無料**に戻る。
8. **返金**（任意・手動）: Stripe ダッシュボードで ¥200 を全額返金。
9. **後片付け**: `ALLOW_LIVE_PAYMENTS` と `PURCHASES_ENABLED` を削除（または false）、`PURCHASE_ALLOWLIST` を削除。`/api/config` が `purchases:false` に戻ったことを確認。
10. **継続課金が残っていないことの確認**:
    `STRIPE_SECRET_KEY=rk_live_… npx vite-node scripts/check-no-open-subscriptions.ts`
    （読み取り専用。「✓ nothing can bill again.」で終了コード 0 なら、請求が続く契約はない。）ダッシュボードの「サブスクリプション」で active が 0 件であることも目視する。

## 失敗したとき
- 購入ボタンが出ない: `/api/me` の `canPurchase` が false（ID の誤り／`PURCHASES_ENABLED`・`ALLOW_LIVE_PAYMENTS` 未設定／キーと価格のモード不一致）。Worker のログに理由（値は出ない）。
- 決済したのに Premium にならない: Webhook の配信状況（署名シークレットの不一致が最多）。ページは 24 秒ほど自動で再確認する。
- 迷ったら、まず `PURCHASES_ENABLED` を false にする（購入だけが止まり、解約・ポータルは使える）。

## 一般公開するとき（別途承認）
許可リストを「全員」に切り替えるには、コードの変更（明示的な許可ルール）が必要です。意図して `*` を許さない設計にしてあります。
