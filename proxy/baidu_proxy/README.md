# 百度翻訳プロキシ（jimakuChan 用・Vercel）

jimakuChan の「翻訳方法：百度翻訳」で使う **CORS 代理** です．Vercel のサーバーレス関数 1 本だけで動きます（依存パッケージなし）．

## なぜ必要か

- 百度の通用文本翻訳 API（`https://fanyi-api.baidu.com/api/trans/vip/translate`）は
  `Access-Control-Allow-Origin` を返さないため，ブラウザから直接呼ぶと CORS で弾かれます（2026-10-14 実測）．
- 署名 `sign = MD5(appid + q + salt + 密钥)` に **MD5** が必要ですが，ブラウザ標準の `crypto.subtle` に MD5 はありません．
  そこで **署名はこの代理（Node）側で作り**，アプリ側には MD5 実装を持ち込みません．

## デプロイ方法

### A) リポジトリ全体を Vercel にデプロイする（おすすめ：アプリと代理が同一サイト）

1. Vercel にリポジトリの**ルート**をインポートする（Framework Preset は `Other`，Root Directory はそのまま）
2. デプロイすると，jimakuChan 本体と `https://<project>.vercel.app/api/translate` が同時に立ち上がります
   （ルートの `api/translate.js` はこの実装を読み込むだけの入り口です）
3. **アプリ側の設定は不要**です．「翻訳方法 → 百度翻訳」で状態が「代理 設定済み（同一サイト）」になっていれば，
   同じサイトの `/api/translate` を自動検出して使っています（ブラウザからは同一オリジンなので CORS の問題も起きません）
4. `BAIDU_APPID` / `BAIDU_KEY` を環境変数に入れておくと，利用者は何も入力せずに使えます（ゼロ設定）
5. 作業用フォルダ（`.agent/` `.spec/` `.output/` `tools/` など）は `.vercelignore` で公開されません．
   関数のリージョンは `vercel.json` で `hkg1`（香港＝百度に近い）にしてあります．不要なら消してください

### B) このフォルダだけを独立プロジェクトとしてデプロイする（アプリが GitHub Pages など別サイトにある場合）

1. [Vercel](https://vercel.com/) のアカウントを作る（無料）
2. このフォルダで次を実行する

   ```bash
   cd proxy/baidu_proxy
   npx vercel deploy --prod
   ```

   初回はログインとプロジェクト作成の質問に答えるだけです（Framework は `Other` で OK）．
3. 表示された URL が代理のアドレスです（末尾に `/api/translate` を付けた形がエンドポイント）

   ```text
   https://<プロジェクト名>.vercel.app/api/translate
   ```

4. アプリの「翻訳方法 → 百度翻訳」の **代理 URL** に，この URL を貼り付けます．
   （`https://xxx.vercel.app` のようにルートだけ貼っても，`/api/translate` はアプリ側で補います）

## 任意の設定（環境変数）

Vercel の **Project Settings → Environment Variables** で設定します（設定後は再デプロイ）．

| 変数 | 用途 |
|---|---|
| `BAIDU_APPID` / `BAIDU_KEY` | 代理側に固定で持たせます．設定すると **利用者は APP ID・密钥の入力が不要**（＝導入が楽）．未設定なら利用者がアプリ側で自分の鍵を入力します．両方設定した場合は環境変数が優先されます |
| `PROXY_TOKEN` | 設定すると `token` の一致が必要になります（公開デプロイの悪用防止）．アプリ側は代理 URL に `?token=xxx` を付けてください |

> 環境変数に**あなたの** APP ID・密钥を入れると，その代理を使う全員が**あなたの無料枠**を消費します．
> 標準版は 5 万文字/月・QPS 1，個人の実名認証後（高級版）は 100 万文字/月・QPS 10 です（超過は 49 元/100 万文字）．
> 自分の代理を使う人だけに配る場合は，`PROXY_TOKEN` を設定してください．

## 動作確認

```bash
# 死活確認（鍵なしでも 200）
curl https://<プロジェクト名>.vercel.app/api/translate

# 翻訳（appid/key を環境変数に設定していない場合）
curl -X POST https://<プロジェクト名>.vercel.app/api/translate \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'q=こんにちは&from=jp&to=ja&appid=あなたのAPPID&key=あなたの密钥'
```

成功すると `{"from":"jp","to":"ja","trans_result":[{"src":"...","dst":"..."}]}` が返ります．
失敗時は百度的に `{"error_code":"54001","error_msg":"Invalid Sign"}` のような JSON が返ります
（`52003` APP ID 未認証／`54001` 署名エラー／`54003` アクセス頻度制限 など）．

## エンドポイント仕様

```text
POST /api/translate
Content-Type: application/x-www-form-urlencoded

q     : 翻訳するテキスト（必須）
from  : 源语言の語種コード（既定 auto）
to    : 目標语言の語種コード（必須）
appid : 百度の APP ID（環境変数に無い場合のみ必要）
key   : 百度の密钥（同上）
token : PROXY_TOKEN を設定した場合のみ（クエリでも可）
```

応答は百度の JSON をそのまま返します．CORS ヘッダは `Access-Control-Allow-Origin: *` を付けます．

## 語種コード（百度側）

jimakuChan の言語コードはアプリ側で変換してから送ります（例：ja→`jp`，ko→`kor`，zh-CN→`zh`，zh-TW→`cht`，es→`spa`）．
この代理は受け取った `from` / `to` をそのまま百度へ渡すだけです．
