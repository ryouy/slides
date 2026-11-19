# Apple 連携のセットアップ (アカウント削除時の Sign in with Apple 取り消し)

App Store の規則 5.1.1(v) により、アカウント削除時に Apple 側の認可も取り消します。以下はオーナーが一度だけ行う作業です。
設定しなくてもアプリは動きます(その場合、削除時の取り消しは "skipped" になります)。

1. Apple Developer → Certificates, Identifiers & Profiles → Keys → 「+」。「Sign in with Apple」を有効にし、Configure でアプリのプライマリ App ID を選んで登録。
2. `.p8` ファイルをダウンロード(**一度きり**)。画面の **Key ID** を控える。**Team ID** は Membership ページにあります。
3. DB マイグレーションを適用: `npx wrangler d1 migrations apply slides-db --remote`
   (Worker が表を自動作成もしますが、適用しておくと確実です。`apple_tokens` が追加されました。)
4. Secrets を登録(リポジトリには絶対に置かない):
   ```
   npx wrangler secret put APPLE_TEAM_ID
   npx wrangler secret put APPLE_KEY_ID
   npx wrangler secret put APPLE_TOKEN_KEY      # 32文字以上のランダム文字列。例: openssl rand -base64 48
   npx wrangler secret put APPLE_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8
   ```
   4つすべてが設定されたときだけ取り消しが有効になります。`APPLE_BUNDLE_ID` は購入用の既存設定をそのまま使います。
5. **`.p8` は絶対にコミットしない**(パスワードマネージャー等で安全に保管)。
6. App Store Connect → アプリ → App Information → App Store Server Notifications で、本番とサンドボックスの両方に
   `https://<worker>/api/apple/notifications` を設定し、バージョンは V2 を選ぶ(購入用で実装済みのエンドポイント)。
7. 動作: アプリがサインイン時に `authorizationCode` を送ると、Worker が refresh token を取得し AES-GCM で暗号化して保存します。
   削除時はまずサーバー上の全データを削除し、その後 Apple の revoke を呼びます。応答は `{ "ok": true, "revoked": "revoked" | "skipped" | "failed" }` です。
