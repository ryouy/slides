# Stripe 制限付きキー: 必要最小限の権限（本番 Worker 用）

Worker が呼ぶ Stripe API は `worker/stripe.ts` の 9 リクエストだけです。必要な権限は **7 つ**。それ以外はすべて「なし」にします。

## 新しいキーの設定案（Dashboard → Developers → API keys → Create restricted key。本番モード）
キー名の例: `art-slide-worker-live`

| リソース（Dashboard の表記は多少異なることがあります） | 設定 | 使う場所 |
|---|---|---|
| Prices | **Read** | 価格が ¥200/月か照合 |
| Customers | **Write** | アカウントごとの顧客を作成 |
| Subscriptions | **Write**（Read を含む） | 契約の読み取り、アカウント削除時の解約 |
| Checkout Sessions | **Write**（Read を含む） | 決済ページの作成・失効・検索 |
| Customer portal（Billing portal sessions） | **Write** | 「サブスクリプションを管理」 |
| 上記以外のすべて | **None** | — |

- Subscriptions と Checkout Sessions は、Read だけでなく **Write** を付けます（Write は Read を含みます）。Prices は Read のみ。
- Webhook の署名検証は `STRIPE_WEBHOOK_SECRET` だけで行うので、API キーの権限は要りません。
- 確認専用スクリプト（`check-stripe-live.ts`）が使う Webhook endpoints Read と Customer portal Read は、Worker には不要です。常設キーには付けず、別の一時キーかダッシュボードで確認します。

## 切り替えの手順（承認後に実施。既存キーは最後まで残す）
1. 新しいキーを作る（上の設定）。
2. 手元で確認（読み取り専用）:
   `STRIPE_SECRET_KEY=<新キー> STRIPE_PRICE_ID=price_… npx vite-node scripts/check-stripe-permissions.ts`
   → 必要な権限が「✓」、不要な権限の「!」が出ないこと。
3. 書き込み権限の確認（副作用なしのプローブ）:
   `PROBE_WRITES=1 STRIPE_SECRET_KEY=<新キー> npx vite-node scripts/check-stripe-permissions.ts`
4. Cloudflare の Secret `STRIPE_SECRET_KEY` を新キーに更新（Secret の更新で新しいバージョンが自動で作られる）。
5. `/api/config` が引き続き `billing:true` であることを確認（販売停止のまま）。
6. しばらく動作を見てから、**旧キーを失効**（Dashboard → 旧キー → Roll/Delete）。

## 戻し方
Cloudflare の `STRIPE_SECRET_KEY` を旧キーの値に戻す（旧キーを失効させる前なら即時）。
