# Free / Premium の画面と機能の確認手順

**対象:** 手元のパソコン（ローカル）。**本番は変更しません**（`VITE_PREMIUM_ENABLED` 未設定・`PURCHASES_ENABLED=false` のまま）。
**確定仕様:**

| | Free | Premium（月額 ¥200） |
|---|---|---|
| 絵画 | 固定 40 点 | 全 404 点＋今後追加する作品すべて |
| 盤面 | レベル 5 まで | レベル 7 まで |
| 広告 | あり | **すべて非表示**（枠も余白もなし） |
| 自分の写真のパズル | 不可（案内が出る） | 可（最大 20 枚・端末内だけ） |
| デイリーパズル | 可 | 可 |

---

## A. 自動テストで確認する（数分・まず最初に）

```
npx tsc --noEmit            # 型チェック
npx vitest run              # 232 件（Worker・Drive 同期・制限の規則など）
npm run build               # 本番ビルド
npx playwright test         # 278 件（画面。PC とスマホ）
```

画面のテストの内訳（`e2e/`）:

| ファイル | 確認していること |
|---|---|
| `states.spec.ts` | **5 つの状態**（未ログイン／Free／Premium／解約予約中／契約終了）それぞれで、絵画のロック・レベルのロック・デイリー・広告・マイフォト・アカウント画面・購入画面 |
| `photos.spec.ts` | 写真の追加・保存・再読み込み・パズル・削除・20 枚の上限・不正ファイルの拒否・外部送信なし・Free では使えない |
| `premium.spec.ts` | 購入導線（サインイン → Subscribe → Checkout）、広告、購入後の確認メッセージ |
| `art.spec.ts`（gating） | ギャラリーの錠前、URL 直打ち、レベルの錠前 |
| `sync.spec.ts` | Google ドライブ同期 |

---

## B. 画面を目で確認する（バックエンド不要）

開発サーバーを起動します。

```
npm run dev
```

ブラウザ（Chrome）で `http://localhost:5173/art-slide` を開き、**F12 → Console** に次を貼り付けて Enter、そのあと **ページを再読み込み**します（開発サーバー専用のスイッチです。本番ビルドには含まれません）。

### B-1. 状態を切り替える貼り付けコード

共通の準備（最初に 1 回）:
```js
localStorage.setItem('slides:dev-gating','1'); localStorage.setItem('slides:dev-operator','1')
```
次の 5 つのどれかを貼ります（`slides:dev-account` が、サーバーの答えの代わりをします）。

**① 未ログイン**
```js
localStorage.setItem('slides:dev-account', JSON.stringify({config:{auth:true,billing:true,purchases:true},me:{signedIn:false,premium:false}}))
```
**② Free（ログイン済み・契約なし）**
```js
localStorage.setItem('slides:dev-account', JSON.stringify({config:{auth:true,billing:true,purchases:true},me:{signedIn:true,premium:false,id:'u1',name:'Ann Example',status:null}}))
```
**③ Premium**
```js
localStorage.setItem('slides:dev-account', JSON.stringify({config:{auth:true,billing:true,purchases:true},me:{signedIn:true,premium:true,id:'u1',name:'Ann Example',status:'active',currentPeriodEnd:Math.floor(Date.now()/1000)+86400*20,cancelAtPeriodEnd:false}}))
```
**④ Premium（解約予約中）**: ③ の `cancelAtPeriodEnd:false` を `true` に
**⑤ 契約終了**
```js
localStorage.setItem('slides:dev-account', JSON.stringify({config:{auth:true,billing:true,purchases:true},me:{signedIn:true,premium:false,id:'u1',name:'Ann Example',status:'canceled',currentPeriodEnd:Math.floor(Date.now()/1000)-86400*5,cancelAtPeriodEnd:false}}))
```
**元に戻す:** `localStorage.removeItem('slides:dev-account'); localStorage.removeItem('slides:dev-gating'); localStorage.removeItem('slides:dev-operator')` → 再読み込み（制限のない従来のサイトに戻ります）。

### B-2. 状態ごとの確認項目

画面左上の `‹` で戻りながら、次を見ます。**「期待」と違う場合は、状態・画面・スクリーンショットを教えてください。**

| 画面（アドレス） | ① 未ログイン | ② Free | ③ Premium | ④ 解約予約中 | ⑤ 契約終了 |
|---|---|---|---|---|---|
| ホーム `/art-slide` →「メニュー」（以前の「More / もっと見る」） | Premium・アカウントのリンクあり（マイフォトも） | 同左 | 同左 | 同左 | 同左 |
| ギャラリー `/art-slide/gallery` | 40 点以外に小さな**錠前** | 同左 | **錠前なし** | 錠前なし | 錠前あり |
| 錠前の作品をタップ | 「この絵画は Premium 限定です」＋価格案内 | 同左 | そのまま遊べる | 遊べる | 案内が出る |
| 好きな作品の画面で、枚数（例 `4×3`）を開く | 6・7 に錠前。選ぶと案内 | 同左 | 錠前なし。7 まで選べる | 錠前なし | 錠前あり |
| 広告（作品画面・WORD・BIG） | **出る** | 出る | **出ない（余白もなし）** | 出ない | 出る |
| デイリー（ホームの「今日の展示」） | 遊べる | 遊べる | 遊べる | 遊べる | 遊べる |
| マイフォト `/art-slide/photos` | 「自分の写真は Premium 限定です」＋案内 | 同左 | 写真を追加できる | できる | 案内（保存済みの写真は残る） |
| アカウント `/art-slide/account` | 「Googleでログイン」 | 名前・**無料プラン**・購入ボタン | 名前・**Premium · … に更新**・「サブスクリプションを管理」 | **Premium · … まで** | 名前・無料プラン・**購入ボタン**（再加入） |
| 購入画面 `/art-slide/premium` | ¥200/月・特典・「Googleでログインして登録します」 | ¥200/月・登録ボタン | 「Premiumをご利用中です」＋管理ボタン | 同左 | ¥200/月・登録ボタン |

### B-3. 言語と画面サイズ

1. **日本語・英語:** ホームの「メニュー」→ 設定 → Language で切り替え（または `/settings`）。②と③で、購入画面・アカウント・マイフォト・錠前の案内が自然な文になっているか
2. **PC:** ブラウザの幅 1280px 程度。ホームは 2 列＋作品の列
3. **スマホ:** F12 → 左上の「デバイスツールバー」アイコン → 幅 390px（iPhone 相当）。上の表を ②③ で再確認。ボタンが画面幅に収まり、横スクロールが出ないこと

### B-4. 自分の写真（Premium の状態 ③ で）

1. `/art-slide/photos` →「写真を追加」→ JPEG / PNG / WebP の写真を選ぶ（複数可）
2. 一覧にカードが出る。使用量（例 `1 / 20 枚 · 0.4 MB / 50 MB`）が変わる
3. カードをタップ → パズルが始まる。「プレビュー」を開く（絵画の解説は出ない）
4. 完成すると結果画面に出る（**共有ボタンは出ない**）。マイフォトのカードに「ベスト 0:45」が出る
5. 再読み込みしても写真が残る。×で削除すると消える（確認が出る）
6. **外部に送られていないこと:** F12 → Network で、写真を追加した前後に、POST や画像のアップロードがない
7. 拒否される例: 拡張子だけ `.png` の別のファイル → 「JPEG・PNG・WebP の画像だけです」。20 枚に達すると「写真を追加」が押せなくなる（複数選択で上限を超える分は「保存できるのは 20 枚までです」）
8. ⑤（契約終了）に切り替えて再読み込み → 同じ写真は**消えず**、遊ぼうとすると案内が出る。③ に戻せばまた遊べる

### B-5. 保存データが壊れていないこと

1. 状態 ③ で、いくつかの絵画を完成させる（ベスト・クリア回数が増える）
2. ② や ⑤ に切り替える → **記録は消えない**（プレイ記録は端末にそのまま残る）。レベル 6・7 で遊びかけの盤面は、再開時にレベル 5 で始め直される（Free では 6・7 が使えないため）
3. 従来の WORD SLIDE・BIG SLIDE の遊びかけも変わらない

---

## C. サーバー側の制限（高解像度画像の保護）の確認

ローカルで、本物の Worker（workerd）に近い環境で確認します。

```
npm run build
npx wrangler d1 migrations apply slides-db --local
cp .dev.vars.example .dev.vars     # SITE_URL=http://localhost:8787 など。Stripe の値はダミーで可
echo 'PREMIUM_ENFORCED=true' >> .dev.vars
npx wrangler dev --local           # http://localhost:8787
```

別のターミナルで（画像 ID は、`FREE` は無料 40 点のどれか、`LOCKED` はそれ以外の作品）:

```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/artworks/monet-stacks-of-wheat-end-of-summer.webp   # Premium 作品・ログインなし → 403
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/artworks/van-gogh-bedroom.webp                      # Free の作品 → 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/artworks/monet-stacks-of-wheat-end-of-summer-thumb.webp  # サムネイル → 200（公開）
```

`PREMIUM_ENFORCED` の行を消して再起動すると、3 つとも 200（今の本番と同じ）になります。

---

## D. 本物の購入を通した確認（任意）

[STRIPE-TEST.md](STRIPE-TEST.md) の手順（テストカード）で、実際に Premium にして B-2 の ③ の列を確認します（ローカルで `VITE_PREMIUM_ENABLED=true npm run build` → `wrangler dev`、または本番のテスト窓）。**このとき**、本番の画面に購入ボタンは出ません（`VITE_PREMIUM_ENABLED` は未設定）。

---

## E. 一般公開の前に必要な作業

| # | 作業 | 状態・メモ |
|---|---|---|
| 1 | **運営者情報**（`src/legal/operator.ts`：氏名・運営統括責任者・所在地/電話の扱い・メール・消費税の扱い・制定日）を入力し、住所・電話を「公開」か「請求時開示」か決める | **未入力**（そろうまで購入ボタンは使えない）。一覧と判断材料は [LEGAL-CHECKLIST.md](LEGAL-CHECKLIST.md) |
| 2 | 利用規約・プライバシーポリシー・特商法表記の文面を、日本語・英語で読んで確認 | 初版を用意済み。LEGAL-CHECKLIST.md の C（判断項目）を確認 |
| 3 | Google OAuth を「本番」に公開／`workers.dev` が承認済みドメインとして受け付けられるか確認（だめなら独自ドメイン） | 要確認 |
| 4 | Stripe を本番モードに：本番キー・本番の価格 ID（¥200・月次）・本番の Webhook・`ALLOW_LIVE_PAYMENTS=true` | テストの顧客データを D1 から掃除してから（STRIPE-TEST.md の 5 章） |
| 5 | **同時に**有効化：`VITE_PREMIUM_ENABLED=true`（ビルド変数）／`PURCHASES_ENABLED=true`／`PREMIUM_ENFORCED=true`（Secret） | 順序と手順は DEPLOY-CHECKLIST.md |
| 6 | 公開直後の確認：`check-deploy.mjs --stage 2`、Free と Premium の実機（PC・スマホ）での確認（この文書の B） | — |
| 7 | 実機（特に **iPhone の Safari**）で写真の追加・回転・保存を確認 | 自動テストは Chrome のみ |
| 8 | 解約・返金・問い合わせの運用（連絡先、返金の判断基準）を決める | — |
