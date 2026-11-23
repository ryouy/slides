# ART SLIDE 作品追加ブリーフ（Colab ノートブックを作るエージェント向け）

目的：ART SLIDE（`ryouy/slides`）に、日本の絵を約 200 点と、有名な画家の作品を画家ごとに約 10 点、追加するための Colab ノートブックを作る。
実行はオーナーが Colab で行い、結果は GitHub（`ryouy/slides`）にコミットされる。既存の `notebooks/ART_SLIDE_Chicago_200.ipynb`（収集）と `notebooks/ART_SLIDE_description_refresh.ipynb`（解説の作り直し）の作りを土台にしてよい。

## 1. 追加する作品

### A. 日本の絵（合計 約 200 点）
- 浮世絵が中心（葛飾北斎、歌川広重 を最優先）。次いで、水墨画、屏風・襖絵、花鳥画、肖像画など。
- 目安の内訳（足りなければ他に回してよい）：
  - 浮世絵（北斎、広重、国芳、歌麿、写楽、春信、清長、英泉、渓斎英泉 など）：約 110 点
  - 水墨画・山水画（雪舟、雪村、等伯、探幽 など。メトロポリタン美術館にあるものに限る）：約 30 点
  - 屏風・絵巻・掛軸の風景、花鳥（琳派の光琳・抱一・其一 など）：約 40 点
  - その他（明治の日本画、肖像画など）：約 20 点
- 1 人の作家が 40 点を超えないようにする。同じ連作（例：『冨嶽三十六景』『東海道五十三次』）から多く取りすぎない（1 連作 15 点まで）。

### B. 有名な画家（各 約 10 点）
次の画家を、各 10 点前後。すでに登録済みの作品は除く（ゴッホは今 9 点あるので、さらに 10 点）。
ゴッホ、モネ、ルノワール、セザンヌ、ゴーギャン、ドガ、マネ、ホイッスラー、サージェント、ホーマー。
代表作をなるべく入れる（解説に値する作品）。

## 2. 使ってよい出どころとライセンス
- **メトロポリタン美術館（The Met）Open Access API**：`isPublicDomain === true` かつ `primaryImage` がある作品のみ。画像は CC0。日本美術は主にここから集める。
- **シカゴ美術館（AIC）API**：`is_public_domain === true` かつ `image_id` がある作品のみ。画像は CC0。
- 画像の権利を API で確認できない作品は、入れない。他の美術館や Wikimedia からは、今回は集めない。
- 画像ごとに、`license`、`licenseUrl`、`licenseBasis`（何を確認したか）、`sourceUrl`、`sourceImageUrl`、`verifiedAt`（確認した日）を、必ず記録する。

## 3. 選ぶ基準
- 絵として一目で何かわかり、パズルにして楽しいもの。画面全体に変化があること（真っ白、一面の無地、文字だけの作品は避ける）。
- **縦横比：0.5 〜 2.0** の範囲のみ（長い絵巻、極端な細長い掛軸は除く）。画像の短辺は 450px 以上。
- 作品の欠損が多い（大きな損傷、画像の端の切れ）ものは避ける。
- 「工房作、○○派、○○風、模写（workshop / follower / after / style of / attributed to）」は入れない。作者がはっきりした作品を選ぶ。
- 全年齢向けのサイトなので、次は入れない：裸体、性的な表現（春画を含む）、暴力、処刑、磔刑、遺体。
- 同じ作品の別の版（同じ版画の別刷り、ほぼ同じ構図）は、1 点だけにする。
- 既存の作品と重複しないこと。最初に、GitHub 上の `artworks.ts`、`additional-artworks.ts`、`public/artworks/` を読み込み、美術館の作品 ID、作品 URL、作者＋タイトル、画像 ID で照合する。保存の直前にも、もう一度、最新のデータで照合する（既存ノートブックと同じ）。

## 4. データの形式（必ず合わせる）
`src/games/art-slide/types.ts` の `Artwork` に合わせる。既存の `additional-artworks.ts` と同じ書き方・同じキー。

- `id`：AIC は `aic-<作品ID>`、Met は `met-<objectID>`。画像ファイルは `/artworks/<id>.webp` と `/artworks/<id>-thumb.webp`。
- 画像：WebP。ゲーム用は長辺 1200px、サムネイルは長辺 420px。元の縦横比を保つ。`width`、`height` は、ゲーム用画像の実寸。
- `title`：英語の正式な作品名（長すぎる浮世絵の題は、シリーズ名を含めてよい）。
- `artist`：英語表記（例：`Katsushika Hokusai`）。`artistSort`：姓 → 名の小文字・アクセントなし。
- `year`、`yearStart`、`yearEnd`、`era`：`era` は、次のどれか 1 つ。`Before 1700`、`1700s`、`1800–1849`、`1850–1879`、`1880–1899`、`1900s`（ダッシュは `–`）。
- `theme`：次のどれか 1 つだけ（新しい分類は作らない。アプリが固定の一覧を使っている）。
  `Landscape`、`Sea & Water`、`City & Street`、`People & Daily Life`、`Portrait`、`Still Life & Flowers`、`Myth & Religion`、`Japanese Prints`。
  - 浮世絵（木版画）は、すべて `Japanese Prints`。
  - 水墨画、屏風などは、主題で分ける（山水は `Landscape` など）。
- `medium`、`museum`（`Art Institute of Chicago` または `The Metropolitan Museum of Art`）。

## 5. 解説文（既存と同じ長さ）
既存の「description_refresh」ノートブックの方式と同じ。
- 英語：原則 350〜550 文字、上限 650 文字。日本語：原則 200〜300 文字、上限 340 文字。
- `description`（英語）と `descriptionTranslations.ja`（日本語）の 2 つだけを作る。ほかの言語は作らない。
- 作品固有の特徴、技法、制作背景を優先。根拠のない解釈や水増しはしない。目録にない話は書かない。材料が少ない作品は短くてよい（ただし 230 文字未満にはしない）。
- **AIC の作品**：公式の解説文があれば、それを要約して使う。`descriptionKind: 'museum_text'`、`descriptionAttribution: 'Art Institute of Chicago'`、`descriptionSourceUrl`、`descriptionLicense: 'CC BY 4.0'`、`descriptionLicenseUrl`、`descriptionModifications`（要約と翻訳をしたこと）を記録する。
- **Met の作品**：Met の解説文は再利用できない。公式メタデータ（作品名、作者、年代、技法、分類、寸法、部門、タグ）だけから書く。`descriptionKind: 'metadata_summary'`。ほかの `description*` の出典欄は、空にする。
- 日本の絵の日本語は、作者名・題名の読みに注意する（例：葛飾北斎、歌川広重、『冨嶽三十六景』）。固有名詞は、一般的な日本語表記にする。

## 6. 実行と保存の条件
- 収集は 1 回で終わらなくてよい。`TARGET_*` の件数を設定で変えられるようにし、API の制限（呼び出しの間隔は 0.65 秒以上）を守る。
- 保存先（既存ノートブックと同じ。1 つの Git コミットにまとめる）：
  `public/artworks/`、`src/games/art-slide/data/additional-artworks.ts`、`src/games/art-slide/data/artworks-research.json`。
- **変更してはいけないもの**：`artworks.ts`、`daily-pools.ts`（毎日のパズルの固定リスト）、既存の作品の画像とデータ。
- GitHub のトークンは Colab のシークレット `GITHUB_TOKEN`。OpenAI を使う場合は `OPENAI_API_KEY`。どちらも、コードやログに出さない。
- 実行前に、`DRY_RUN = True` で、件数・内訳・重複・文字数の一覧を出して、確認できるようにする。
- 最後に、次を表示する：追加した件数（日本の絵／画家ごと）、除外した件数と理由、文字数が基準外の解説、コミット URL。

## 7. 追加後に、こちらで行うこと（エージェントは触らない）
- 新しい作品は、Premium 限定として、アプリが後からダウンロードする。iOS の同梱（75 点）には入らない。
- iOS 用のデータの書き出しと、Web のビルドの確認は、リポジトリ側で行う。
