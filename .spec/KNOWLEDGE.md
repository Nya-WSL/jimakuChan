# KNOWLEDGE - ドメイン知識・調査結果

## 業務・ドメイン知識
- jimakuChan は配信者向けリアルタイム音声認識字幕アプリ．西村ポリシー：導入簡単／機能を絞る／安定・超軽量／縁取りは外側にだけ伸び改行がずれない
- 競合：mojicast（ishiki-emo，pywebview＋ローカル ASR/翻訳モデル，OBS は http://localhost:8765）．こちらの差別化はゼロインストール・軽量

## 調査・リサーチ結果（2026-08-16）
- v1 の主なバグ：フォント select 値のバックスラッシュ不一致でプリセット破損／switchTranslationMethod の TypeError／isLoadingPreset TDZ／起動時 iframe 多重リロード／伏字が部分一致で過多（class→cl***）／404 テキストがワードリスト化／zh-CN 等のフォルダマッピング誤り／Chrome 翻訳失敗時の GAS フォールバック不成立／古い翻訳が新しい字幕を上書き／innerHTML XSS／postMessage 送信元未検証 など（詳細は .output/report_20260816.html と Codex 監査）
- goodBadWordlist：es/fr/de/pt が Latin-1 で保存されていた（UTF-8 で読むと非 ASCII 行が一致しない），zh-TW は破損．2026-08-16 に全面見直し
- Web Speech API：SpeechRecognitionPhrase の boost は 0〜10．オンデバイス認識は `SpeechRecognition.available({langs, processLocally:true})`
- Chrome Translator API：`Translator.availability()` が環境により応答しないことがある → 4 秒でタイムアウト．モデル DL はユーザー操作が必要
- obs-websocket v5：`CallVendorRequest{vendorName:'obs-browser', requestType:'emit_event', requestData:{event_name, event_data}}` で全ブラウザソースに DOM イベントを送れる．認証は sha256(base64(sha256(pw+salt))+challenge)
- Chrome の -webkit-text-stroke は角が尖る（miter）．v1 と同じ．`paint-order: stroke fill` は Chrome 123+ / OBS 31+ で HTML テキストに使えるが，CEF が古い OBS もあるので擬似要素 2 層方式を採用

## 2026-10-14 百度翻訳（通用文本翻訳）対応の調査結果
- 通用文本翻訳 API は `POST https://fanyi-api.baidu.com/api/trans/vip/translate`，
  `sign = MD5(appid + q + salt + 密钥)`，応答は `trans_result[].dst` か `error_code`
- **CORS 非対応（実測）**：`Origin: https://sayonari.github.io` を付けた POST / OPTIONS のどちらも
  `Access-Control-Allow-Origin` を返さない（200 だがヘッダ無し）→ ブラウザ直叩きは不可．プロキシ必須
  （同じ結論の事例：CSDN「解决 CORS 跨域资源共享（以百度翻译 API 为例）」）
- `crypto.subtle` に MD5 は無い → 署名はプロキシ側（Node）で作るのが素直．アプリ側に MD5 実装を足さない
- 無料枠：標準版は 5 万文字/月・QPS 1（未認証），個人実名認証で高級版 100 万文字/月・QPS 10．
  超過は 49 元/100 万文字．字幕は 1 文＝1 リクエスト（翻訳先ごと）なので **QPS 1 では 54003 が出やすい**
- 同名の紛らわしい API に注意：`/product/113`＝通用文本翻訳（appid+sign），
  `doc/21` は現在「大模型文本翻訳」で `Authorization: Bearer` の API Key 認証（別物）

## 2026-10-14 追記：百度「网页版（非公式）」接口は使えないと結論
- 現行の fanyi.baidu.com フロント（`index.a5023d3d.js` 5.4MB）は `v2transapi` を呼んでいない．
  `window.v2Fetch({url:"/transapi", method:"POST", acsConf:{useAcsToken:true}})` →
  **`Acs-Token` ヘッダ必須**（百度の ACS 風控 SDK が `a.e.create({sid, timeout:5000})` で実行時に生成．
  sid・時刻・環境依存の反爬トークン）
- 旧記事の方式（2018 hujingshuang／2023 CSDN：`token`＋`gtk`＋`sign`）は前提が消滅：
  現在の HTML・JS に `token` / `gtk` / `v2transapi` は存在しない（実測）
- 実測結果：`v2transapi` は Cookie 無しで `errno 1022`（風控），Cookie 有りでも `errno 995`（token/sign 不正相当）．
  `transapi` は Referer 無しで空ボディ，Referer 有りで 1022
- 結論：网页版は反爬で守られており，サーバー（とくに Vercel のような机房 IP）から再現するのは非現実的．
  正式には官方 API（appid＋MD5 署名）を使う（利用者に案内済み）

## 技術的な知見
- BroadcastChannel は file:// では別ウィンドウに届かないことがある → popup には postMessage も併用
- Playwright headless で `Translator.availability()` の Promise が GC される → タイムアウトで保護
- 動画：フレームを Playwright で描画→ffmpeg image2pipe．30fps 1280x720 で約 5fps の描画速度（70 秒動画≒7 分）

## 決定事項と理由
- エンジンを iframe(main.html) から index.html に移動：設定変更のたびの iframe リロード（＝認識再起動）をなくすため
- 表示は overlay.html に統一：プレビュー／ポップアップ／OBS で同じ描画コードにするため
- 秘密機能（パスワード）は廃止し「詳細」折りたたみに：混乱防止は保ちつつ簡素化
- v1 の設定は自動移行（localStorage jimakuChan_presets → jimakuChan_v2_presets）

## 2026-08-16 実機テスト初回フィードバックへの対応
- 日本語認識結果に形態素ごとの半角スペース → app.js `tidy()` で CJK 間（CJK–英数間も）のスペースを除去
- 途中結果表示時に前の確定文が残る → 途中結果のみ表示
- 2 文目の頭が切れる → `continuous=true` の 1 セッションを回す「連続モード」を既定に（recognizer.js mode='continuous'）．shortPause 経過で仮確定（soft）して字幕・翻訳を先出し，Chrome の本確定で差分だけ追加／訂正．従来方式は「文ごとに再起動」として残す
- PC 内フォント → `window.queryLocalFonts()`（Chrome 103+，初回に許可ダイアログ）で一覧をプルダウンに追加．option に font-family を付けてプレビュー
- OBS で表示されない → 原因の本命は OBS(CEF) が自己署名 https://localhost を拒否すること．run_server.py に http:4444 を併設し，localhost 時はそちらを登録．file:// 時は is_local_file で登録．テスト送信は vendor request の成否を表示，overlay は OBS 内で受信するまで「接続待ち」バッジを表示

## 2026-08-16 3 回目フィードバック
- v1 バナーに「このまま v1 を使う（次回から表示しない）」（localStorage jimakuChan_hideV2Banner）
- 表示モード：設定を隠して字幕だけ（body.display-mode，ui.displayMode に記憶．iframe 内クリック→postMessage / Esc で戻る）．別窓は残すが補助扱い
- 縁取り：-webkit-text-stroke の miter トゲ → 円周状 text-shadow の膨張（strokeMode round/sharp）

## 2026-08-22 スペイン語認識の報告から学んだこと
- **利用者の画面キャプチャは数字を読む**．今回は右下の「6 translations」が決め手で，
  「翻訳が 6 回成功している＝認識経路は生きている」と分かり，切り分けが一気に進んだ
- **Chrome の音声認識は同じ言語でも地域コードで可否が変わることがある**．認識言語は
  地域バリアントを複数用意しておくと，利用者自身が回避できる
- **エラーを黙って握りつぶさない**．v2 は `language-not-supported` を無言で再起動し続けており，
  利用者からは「ただ字幕が出ない」ようにしか見えなかった．致命エラーは文言を分けて画面に残す
- **v1 と v2 で伏字の判定方式が違う**（v1＝全言語で部分一致，v2＝ラテン系は単語境界）．
  共有リソース（goodBadWordlist）を更新するときは，古い側のアルゴリズムでも検証する．
  検証は両方を再現した Node スクリプトで文例を通すのが速い

## 2026-10-01 長時間配信での停止対策・キーワード登録
- 認識セッションは黙って止まることがある（onstart も onend も来ず 'starting' のまま）．v2 には見張りが無く二度と再開しなかった → ウォッチドッグ（3 秒ごと，starting 8 秒／無反応 30 秒（連続モード 90 秒）で作り直し）
- `_build()` で作り直した後，古いインスタンスの遅れた onend が新しい状態配列を壊す → 各ハンドラで `this._instances[i] === rec` を確認
- Chrome 翻訳 `translate()` にタイムアウトが無く，返らないと翻訳が止まったままになる → 10 秒で打ち切り，翻訳器を捨てて作り直す
- 旧版の「1000 回ごとのクリーンアップ」は 20 分未使用の翻訳器しか消さないので，使い続けている翻訳器には効いていなかった → 300 回 or 20 分で裏で作り直して差し替え
- 2025-09 の STATUS_BREAKPOINT（約 1 時間でタブがクラッシュ）は Chrome 側の修正で 2025-10 に 30 分リロードを撤去済み．タブ自体が落ちる場合は JS では防げない
- phrases（コンテキストバイアス）：Chrome 142 出荷．オンデバイス認識のみ．Chrome 154 / macOS で ja-JP ローカルは available・phrases 設定でエラーなし，クラウドは phrases-not-supported（実測）
- **日本語のキーワード登録は効かない（2026-10-01 実測）**：Chrome 154 の ja-JP ローカル認識は phrases を受け付ける（エラーにならない）が，結果は変わらない．「受け付ける＝効く」ではない
- キーワード欄の「ローカル認識時のみ有効」は placeholder にしか書いていないので，語を入れると見えなくなる．公開版の先生の設定も recogModel=cloud だった（ローカル→クラウドの自動切替は設定を保存し直すので気づきにくい）
- 実機の音声テストは「afplay で TTS をスピーカーから流し，先生の Chrome のタブ（拡張経由）で認識」で回る．Playwright で起動した Chrome は偽音声ファイルが getUserMedia には届くが Web Speech には届かなかった

