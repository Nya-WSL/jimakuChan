# SPEC - 技術仕様・要件定義（v2, 2026-08-16）

## 機能要件
- 音声認識：Web Speech API（Chrome）．言語 25 種．文の区切り(shortPause)・消去タイマー・棒読みちゃん送信
- 翻訳：最大 3 言語同時．Chrome 内蔵 Translator API（138+）→ 失敗時 GAS フォールバック．モデル DL ボタン
- 見た目：4 行（認識・翻訳1-3）ごとにフォント／色／フチ色／サイズ／太さ／縁取り．テーマ（縁取り・ボックス・ネオン・シャドウ・ピル），出現アニメ，背景色／透過，左右・上下配置，改行，行間，認識途中マーカー
- プリセット：組み込み 8 種＋カスタム 3．自動保存．JSON でエクスポート／インポート．v1 設定の自動移行
- 伏字：goodBadWordlist（認識言語＋翻訳言語）＋ユーザー追加語／除外語．ラテン系は単語境界判定
- 語句置換：「前→後」（表示・翻訳・OBS 全てに反映）
- OBS：A) obs-websocket 経由でブラウザソースへ配信＋ワンクリック追加，B) 表示ウィンドウ（クロマキー），C) テキストソース直接更新（任意）
- 起動ファイル（.bat/.command），日英 UI

## 非機能要件
- 依存ライブラリなし（vanilla JS），GitHub Pages で静的配信，file:// でも設定・プレビューが動く
- 認識・翻訳・表示の各処理は 1 ファイル 1 責務（js/*.js）
- 縁取りは擬似要素 2 層方式で「外側にだけ太く」「改行が一致」

## 技術構成
- index.html + js/app.js（エンジンホスト）／ overlay.html + js/overlay.js（表示）／ js/{recognizer,translator,filter,obs,presets,i18n}.js
- 配信経路：postMessage（iframe/popup）・BroadcastChannel('jimakuChan')・obs-browser emit_event（DOM イベント 'jimakuChan'）
- 動画生成：tools/promo_video（Playwright フレーム描画 → ffmpeg，say/Kyoko ナレーション，numpy BGM）

---

# SPEC 追加：翻訳方法「百度翻訳」対応（2026-10-14 西村指示）

## 目的・背景
- 百度翻訳開放平台の「通用文本翻訳 API」を翻訳方法として選べるようにする（v1・v2 の両方）
- 想定利用者：中国本土など，Chrome 内蔵翻訳（Google のモデル配信）や GAS（script.google.com）が使えない環境．
  百度の無料枠（標準版 5 万文字/月・QPS 1／個人認証後の高級版 100 万文字/月・QPS 10）で自分の鍵を使える
- 方針（西村確認済み 2026-10-14）：**Vercel のサーバーレス関数をプロキシとして使う**／**v2 と v1（main.html）の両方に追加**／
  **百度を優先し，失敗したら Chrome・GAS にフォールバック**

## 前提（調査結果・2026-10-14 実測）
- 通用文本翻訳 API：`POST https://fanyi-api.baidu.com/api/trans/vip/translate`
  パラメータ `q, from, to, appid, salt, sign`（`sign = MD5(appid + q + salt + 密钥)`）／
  応答 `{from, to, trans_result:[{src,dst}]}` または `{error_code, error_msg}`
- **CORS 非対応**：`Origin` 付きの GET/POST・OPTIONS いずれも `Access-Control-Allow-Origin` を返さない（実測）→
  ブラウザから直叩きは不可．プロキシ必須．また静的サイトに密钥を埋め込むのは不可（各自の鍵を設定してもらう）
- ブラウザ標準の `crypto.subtle` に MD5 は無い → **署名はプロキシ側（Node の crypto）で作る**（クライアントに MD5 実装を持ち込まない）

## 追加する構成：Vercel プロキシ（新規 `proxy/baidu_proxy/`）
- `api/translate.js`（Node サーバーレス関数）
  - CORS ヘッダ（`Access-Control-Allow-Origin: *`，`OPTIONS` は 204）を返す
  - リクエスト：`POST`（JSON ボディ）`{ q, from, to, appid?, key? }`
  - 認証情報の優先順：環境変数 `BAIDU_APPID`／`BAIDU_KEY`（設定されていればそれを使い，ボディの値は無視）
    → ボディの `appid`／`key`
  - `salt` を生成し `sign = MD5(appid + q + salt + key)` を作って百度へ POST（8 秒タイムアウト）
  - 応答：百度の応答 JSON をそのまま返す（`error_code` の解釈はアプリ側）．HTTP ステータスは異常時 502/504
  - 任意：環境変数 `PROXY_TOKEN` があれば `token`（クエリ or `x-proxy-token` ヘッダ）一致を要求（公開デプロイの悪用防止）
  - `GET`（`q` なし）は死活確認用に `{ok:true, version}` を返す
- `package.json`／`README.md`（`npx vercel deploy --prod` の手順，環境変数の説明）
- GitHub Pages の配信対象（ルート以下）に置くが，静的サイトの動作には影響しない

## アプリ側の設定項目（v2＝プリセット，v1＝設定＋URL パラメータ）
| キー | v2（presets.js） | v1（index.html → main.html） | 内容 |
|---|---|---|---|
| 翻訳方法 | `translationMethod` = `chrome`\|`baidu`\|`gas` | ラジオ `translation_method` | 3 択に拡張 |
| プロキシ URL | `baiduProxyUrl` | `baidu_proxy` | 例 `https://xxx.vercel.app/api/translate`．ルート URL だけでも可（`/api/translate` を補う） |
| APP ID | `baiduAppId` | `baidu_appid` | 百度の APP ID（プロキシの環境変数を使う場合は空でよい） |
| 密钥 | `baiduKey` | `baidu_key` | 百度の密钥（同上） |

## 優先順位とフォールバック（案・要確認）
1. 「翻訳方法」で選んだ方法を最優先（百度はプロキシ URL と鍵（or プロキシの環境変数）が揃っているときだけ利用可）
2. 百度の 3 項目が新たに揃ったとき，翻訳方法が `chrome` のままなら **自動で `baidu` に切り替える**（画面・保存にも反映．以後は利用者の明示選択を尊重）
3. 失敗時は残りの利用可能な方法へフォールバック．基本順は **baidu → chrome → gas**（選択済みのものは除く）
4. 同一言語（既存の `same` 判定）はそのまま

## 言語コードのマッピング（jimakuChan → 百度）
- ja→`jp`, ko→`kor`, zh-CN→`zh`, zh-TW→`cht`, zh-HK→`cht`, en→`en`, fr→`fra`, it→`it`, de→`de`, es→`spa`,
  pt→`pt`, ru→`ru`, uk→`ukr`, pl→`pl`, nl→`nl`, sv→`swe`, tr→`tr`, id→`id`, vi→`vie`, th→`th`, ar→`ara`, el→`el`, hi→`hi`
- 元言語は同じ表を使い，表に無いものは `auto`（自動判定）
- 表に無い**翻訳先**は百度を使わず，他の方法へ回す（誤ったコードを送らない）
- 実装時に公式「語種リスト」で表を最終確認する

## エラー表示（百度 error_code → 表示文言）
- 52003 未認証ユーザー（APP ID を確認／サービス未開通）／54001 署名エラー／54000 パラメータ不足／
  54003 アクセス頻度制限（QPS 超過．高級版または間隔をあける案内）／54004 残高不足／54005 長文の連投／
  58000 クライアント IP 不正（IP 制限）／58001 翻訳方向に非対応／90107 実名認証が未完了
- 52001／52002（タイムアウト・系統エラー）は 1 回だけ再試行
- プロキシ未設定・到達不可は「プロキシ未設定／接続できません」として表示

## 非機能・注意
- タイムアウト：代理側（百度への転送）8 秒，アプリ側（代理へ）15 秒．字幕 1 文につき翻訳先の数だけリクエストが出る（3 言語＝3 回）→
  標準版 QPS 1 では 54003 になりやすい旨を設定画面のヘルプに書く
- 依存ライブラリなし（アプリ側）／プロキシは Node 標準モジュールのみ
- v1（利用者 2 万人）は既存動作を壊さないことを最優先：百度未設定なら従来と完全に同じ経路を通る

## 決定事項（2026-10-14 西村・実装済み）
- **翻訳方法の自動切替はしない**：百度の設定が揃っても，利用者が「百度翻訳」を選ぶまでは使わない（フォールバックの試行順だけ固定で「選んだ方法 → 百度 → Chrome → GAS」）
- **百度の「网页版」接口は使わない**：2026-10-14 実測で `Acs-Token` 反爬になっておりサーバーから再現不可（`.spec/KNOWLEDGE.md` 参照）→ **公式 API のみ**
- プロキシは **Vercel**（`proxy/baidu_proxy/`）．鍵は「アプリ側で利用者が入力」と「代理の環境変数（`BAIDU_APPID` / `BAIDU_KEY`）」の両対応（代理側の値が優先）．`PROXY_TOKEN` は任意
- 実装後の検証：構文チェック＋Node のローカルテスト 25 項目 ALL PASS（代理の CORS・token・語種マップ・回退順・52001 の再試行・エラー文言・実際に百度まで到達して 52003 が返ること）

## 追記（2026-10-15）：「フロント＋代理を Vercel にまとめてデプロイ」（西村指示）
- リポジトリの**ルート**を Vercel にインポートすれば，サイト本体と `/api/translate` が同一オリジンで立ち上がる（西村の要望「前后端全在vercel运行」）
  - ルート `api/translate.js` ＝ 実体（`proxy/baidu_proxy/api/translate.js`）を `require` するだけの入り口．
    従来の「代理フォルダ単体でデプロイ」もそのまま使える
  - `vercel.json`：関数リージョン `hkg1`（香港＝百度に近い．不要なら削除）＋ `/api/*` に `Cache-Control: no-store`
  - `.vercelignore`：`.agent/` `.spec/` `.output/` `.references/` `tools/` `test_tools/` `v2/tools/` `*.md` を公開しない．
    **`proxy/` はルート `api/translate.js` が読むので除外しないこと**
- アプリは**同一サイトの代理を自動検出**する（`GET /api/translate` が `{ok:true, service:"jimakuChan baidu proxy"}` を返したら `/api/translate` を使う）
  - v2：`Translator.detectSameOriginProxy()` を `refreshTranslatorUI()` から呼ぶ（代理 URL が未入力のときだけ．結果はキャッシュ）．
    状態表示は「代理 設定済み（同一サイト）」（i18n `baiduStatusSame`）
  - v1：`main.html` の起動時に XHR で同じ確認をして `baiduAutoProxy` に保持．`effectiveBaiduProxy()` ＝ 設定値 ＞ 自動検出
  - GitHub Pages など代理が無い環境では 404 になるだけで，従来の動作には影響しない
- 相対パス対応：`proxyEndpoint()` / `baiduProxyEndpoint()` は `/api/translate` のような同一オリジンのパスをそのまま受け付ける
- タイムアウト：代理側 8 秒（Vercel Hobby の関数上限 10 秒に収める）／アプリ側 15 秒
