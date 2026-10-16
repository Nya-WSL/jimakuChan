# TODO - タスクリスト

## 2026-10-16 百度翻訳：呼び出し結果をログに残す（`54001 署名エラー` の切り分け用）
- [x] 代理（`proxy/baidu_proxy/api/translate.js`）：百度への呼び出し結果（from/to・q 長・appid・appid/key の取得元・HTTP ステータス・応答本文 300 文字）を `console.log`（Vercel の Functions ログで見る）．密钥と sign は出さない
- [x] v2（`v2/js/translator.js`）：百度 API の応答（OK／error_code／結果が空／JSON でない／HTTP エラー）を，代理 URL（`token=` は伏せる）つきでログ．`err.detail` に応答 JSON を保持
- [x] v1（`main.html`）：同じく呼び出し結果（OK／百度エラー／代理エラー／不正／タイムアウト）をログ
- [x] 回帰テスト `v2/tools/promo_video/test_baidu.mjs` ALL PASS（30 項目）
- [ ] 先生の実機で再現 → ログを見て `54001` の原因（環境変数の値か，再デプロイ漏れか）を確定させる

## 2026-10-15 GA（Google Analytics）を削除
- [x] `index.html`・`main.html`・`v2/index.html` から gtag.js を削除
      → `_ga` の cookie 警告が消え，中国本土での外部リクエストもなくなる．gtag() を呼ぶコードは無し
- 復元する場合は 0c37705 に元のコードが残っている

## 2026-10-15 追加：フロント＋代理を Vercel にまとめてデプロイ（詳細は SPEC.md 追記）
- [x] ルート `api/translate.js`（`proxy/baidu_proxy/api/translate.js` を読み込む入り口）・`vercel.json`（リージョン hkg1）・`.vercelignore`
- [x] v2：同一サイトの代理を自動検出（`detectSameOriginProxy`）＋状態表示「代理 設定済み（同一サイト）」＋ `/api/translate` 相対パス対応
- [x] v1：`main.html` で起動時に自動検出（`baiduAutoProxy` / `effectiveBaiduProxy`）＋相対パス対応＋タイムアウト処理
- [x] タイムアウト調整（代理 8 秒／アプリ 15 秒），proxy と v2/README に Vercel 一括デプロイ手順（方式 A/B）を追記
- [x] 回帰テストに自動検出・相対パスのチェックを追加し ALL PASS（27 項目）
- [x] `/v2`（末尾スラッシュ無し）で開くと静的ファイルが 404 になる問題を修正（`v2/index.html` の `<base>` 差し込み＋`app.js` の `baseUrl()`/OBS パスの末尾スラッシュ対応．詳細は KNOWLEDGE.md）
- [ ] 先生の実機テスト：再デプロイ → `/v2` と `/v2/` の両方で表示・翻訳・OBS 用 URL を確認 → コミット・push

## 2026-10-14 追加：翻訳方法「百度翻訳」対応（v1・v2／詳細は SPEC.md 追加分）
- [x] Vercel プロキシを新規作成（`proxy/baidu_proxy/`：api/translate.js・package.json・README.md）
- [x] v2：`js/translator.js` に百度メソッド＋言語マップ＋error_code の文言＋フォールバック
- [x] v2：設定 UI（翻訳方法 3 択／代理 URL・APP ID・密钥）・`presets.js` DEFAULTS・`i18n.js`（日英）・`app.js`（状態表示）
- [x] v1：`index.html`（ラジオ追加・入力欄・config_values・URL パラメータ・プリセット・`js/i18n.js`・switchTranslationMethod）
- [x] v1：`main.html`（URL パラメータ受取・百度を Chrome より先に試す・言語マップ・ステータス表示・Chrome/GAS への回退）
- [x] ドキュメント（v2/README.md に「翻訳」節・proxy の README）
- [x] ローカル検証：`v2/tools/promo_video/test_baidu.mjs`（代理＋エンジンの 24 項目 ALL PASS．うち 1 項目は実ネットワークで百度まで到達し `52003 UNAUTHORIZED USER` が返ることを確認）＋ HTML 内インライン script を含む構文チェック（この環境には playwright が無いため UI テストはスキップ．`npm i playwright` があれば (3) の UI 配線テストも走る）
- [ ] 先生の実機テスト → コミット・push（VERSION は 2026.10.14 20:35 に更新済み．テスト前にコミットしない）
- [ ] 決定の記録：百度「网页版」は Acs-Token 反爬で再現不可 → **公式 API のみ**／翻訳方法は自動切替しない（利用者の選択のみ）
- [ ] 未対応：v1 の「困ったときは」ページ（sayonari_web）への百度の作り方の追記（必要なら）

## 2026-10-14 整理（一覧は .output/2026-10-14_現状とToDo_入力ソース拡張案.html）
- [x] 入力ソース拡張 実装済（2026-10-14・test_tab_audio.mjs ALL PASS）→ [ ] 先生実機テスト → コミット・push（VERSION 更新）．元の案：：①欄名「マイク」→「音声入力」＋「ライン入力・オーディオインターフェースも選べます」（ライン入力は既に audioinput として一覧に出る）／②プルダウンに「Chromeのタブの音声…」（getDisplayMedia → mic.js の処理経路へ．ジュノーンさん方式）
- [x] 「困ったときは」追記 → 2026-10-14 アップロード済
- [x] Issue #14 の問い合わせ者への案内 → 先生が送信済み・解決（2026-10-14）
- [x] phrases（キーワード登録）は日本語では効かないと結論 → 閉じる

## 優先度：高
- [x] しゅりみんさん返信済・配信で確認済（2026-10-14）
- [x] 鬼灯ルルさんへ返信（2026-10-14 先生送信済．ja モデルの選び直し→on-device-translation-internals で入れ直し）→ [ ] 結果待ち
- [ ] 返信：Danny さん（今回の push 後）（文案 = .output/2026-10-14_タブ音声_v1伏字_返信文案.html）
- [x] 2026-10-11 Issue #14「start(track) で例外なく認識が始まらず watchdog が作り直しを繰り返す」（Win11 Chrome，start() なら動く．同様の問い合わせあり）対応（v2・**未コミット**）：
      track 使用中に結果ゼロのまま作り直しが 2 回続いたら 処理後 track → 生 track → start()（既定マイク）へ段階的に下げる．
      先生案でマイクのプルダウンに「マイク選択を使わない（認識が始まらないとき用）」を追加（自分で選べる／問題検出時は自動で切替えて localStorage 保存／
      戻すときは利用者がマイクを選び直す）．連続モードの無音による no-events は数えない．
      回帰テスト v2/tools/promo_video/test_track_stall.mjs ALL PASS（約 19 秒で切替・再読込後は即 start()）・既存テストも OK
      （test_ui.mjs は変更前から page.goto でクラッシュする．別件）．→ 先生実機 OK・push ff432ec（Ver 2026.10.11 18:08）・Pages 反映済・Issue #14 に返信済
- [x] 2026-10-06 v1：確定結果が形態素ごとにスペース区切りで出る件 → main.html に tidyRecogText（v2 の tidy を移植，ja/zh のみ・ko は分かち書きなので対象外）．Ver 2026.10.06 20:08．先生の指示でコミット・push
- [x] 2026-10-06 v2：tidy() から ko（韓国語）を除外（分かち書きを残す・英語もそのまま）．先生の指示でコミット・push
- [x] 2026-10-01「一定時間ごとに止まる／定期的に固まる」報告対応（v2 のみ・未コミット・Ver 2026.10.01 19:07）：
      認識ウォッチドッグ（固まったセッションを作り直す）＋古いインスタンスのイベント無視，
      Chrome 翻訳のタイムアウト（10 秒）＋翻訳器の定期作り直し（300 回 or 20 分）．
      回帰テスト v2/tools/promo_video/test_watchdog.mjs 全 OK．**先生の実機テスト待ち → コミット**．
      → 先生判断で **v1 にも適用**（main.html にウォッチドッグ，chrome_translator_v2.js は v2 版をコピー，
      マイク未許可時は見張りを止める）．test_v1_watchdog.mjs OK．v1・v2 とも実機テスト待ち
      → 先生指示で commit・push（e145740）・Pages 反映確認済．先生が X で告知し，利用者に1時間連続使用の結果を募る
- [ ] X での「1時間止まらないか」報告の集約（止まった報告があれば Chrome バージョン・v1/v2・翻訳有無を聞く）
- [x] 2026-10-01 キーワード登録（phrases）：Chrome 154 で ja-JP オンデバイス認識は phrases を受け付けることを確認
      （クラウド認識は phrases-not-supported）．→ 同日，TTS をスピーカー→マイクで流して実測：
      キーワードあり／なしで結果は変わらず（「犬 次郎 累」「M 次郎 ルイ」）＝**日本語では効かない**（先生の以前のテストと同じ）
- [x] 2026-08-22 X の報告「スペイン語だけ認識されない」対応：認識言語に es-ES/MX/US/AR/CO を追加，
      language-not-supported の可視化（従来は「マイク未許可」と誤表示）→ push（48d8acd, Ver 2026.08.22 17:41）
- [x] 2026-08-27 しゅりみんさん報告「1行スタイルで左端が切れる」対応：
      （1回目 0ac0b93 = 両端に常時固定 → 先生の意図と違ったため却下）
      → **0fc454f, Ver 2026.08.27 22:57**：認識中マーカーは従来どおり途中結果にだけ付き，
      途中結果が長くなって左の << が窓の外へ流れ出るときだけ，その印を行の左端に残す方式に．
      あわせて字幕表示領域のクリックで表示モードを出入りできるように（v1 と同じ操作感）．
      Pages 反映確認済み．**先生の実機テスト結果待ち**
- [x] しゅりみんさんへの返信（文案 = .output/2026-08-27_1行表示_両端マーカー実装.html 末尾）
- [ ] 1行表示の詰め（先生の実機テスト後）：吸い込みのぼかし幅（いま印の幅＋0.45em）／
      確定文が長いときも左端に印を出すか（いまは途中結果のときだけ）／自動縮小案（下限60%）の要否
- [ ] Danny への返信（Chrome 151 Win10．Chrome 151 に該当変更なし．コンソール貼り付けスニペットで
      「音が届いていない」か「返ってこない」かを切り分ける．文案 = .output/2026-08-27_1行表示と認識不具合_調査.html）
- [ ] 検討：マイク入力レベルメーター／診断パネル（?debug=1）— 海外ユーザーの切り分けが楽になる（先生判断）
- [x] 報告者（Danny）への返信 → 2026-08-27 返答あり：Chrome 151.0.7922.174 / Windows 10，
      コンソールにエラーなし・Listening のまま結果ゼロ（続きは上の「Danny への返信」）
- [x] 2026-10-14 v1 の伏字を v2 filter.js と同じ判定に置換（main.html・Ver 2026.10.14 18:48・未コミット）→ [ ] 先生実機テスト → コミット・push．旧メモ：**v1（従来版）の伏字が全言語で部分一致のままである件の方針決定**．GoodList 補強で当座は緩和したが
      （2026-08-22 push 2c6cdd3），en `ass`／fr `cul`／id `tai` `asu` などは根本的には単語境界化が必要．
      2 万人利用のため西村先生の判断待ち
- [x] 2026-08-17 OBS 側の不具合修正（消えない／再読み込みで戻る／言語表記／v1 の v2 リンク）実機テスト済 → push（ef4e11b）
- [ ] 西村による実機テスト（Chrome 実機でマイク認識・Chrome 翻訳・OBS 31 でブラウザソース追加・クロマキー窓）
- [x] v2 を v2/ に配置して main にマージ・push（2026-08-16 β公開 https://sayonari.github.io/jimakuChan/v2/）
- [x] goodBadWordlist の 2 コミット（ローカル main）を push（2026-08-16 確認：origin/main と同期済み）
- [x] 紹介動画・OBS ガイド動画を Twitter 投稿（2026-08-16）
- [ ] 将来：メイン URL を v2 に切替（ルートを v2 に置き換え，旧版は v1/ へ）

## 進行中：マイク選択＋入力レベルメーター（start(audioTrack)）＋宣伝（2026-10-09 先生指示）
- [x] v2：マイク選択（getUserMedia → SpeechRecognition.start(track)，未対応 Chrome は既定マイク＋最新版への更新案内）
- [x] v2：入力レベルメーター（Web Audio．音が来ていないときの表示も）
- [x] 先生テスト → コミット・push（99cdbdf）
- [x] ドパガキ仕様の PV（Twitter 用，v2 移行と Chrome 最新版への更新を促す）
- [x] Twitter 文案（先生のいつもの形式）
- [ ] 報告者へお礼・反映のお知らせ（ジュノーンさんへのお礼含む）
- [ ] X 文案の Ver 差し替え
- [ ] ミュート操作の改善
- [ ] test_ui.mjs が page.goto でクラッシュ（以前から・未調査）

## 完了：ローカル認識の混入対策（2026-10-08 報告・方針確定）
方針：.output/2026-10-08_ローカル認識混入_問題整理と修正方針.html（先生決定：推定表示はしない／v1 にも全部載せる／無反応検出は 20 秒）
- [x] A モデル状態の常時表示＋クラウド選択時の「ローカルになる場合あり」表示（v1・v2）
- [x] C ローカルモデル削除の案内（詳しい人向けの折りたたみ．chrome://settings/accessibility →「自動字幕起こし」をオン → 言語一覧から削除）（v1・v2）
- [x] D モデル取得時に en-US も一緒に入れる・en-US 欠けの警告（v1・v2）
- [x] E 音は来るのに結果 0 件が 20 秒続いたら原因と対処を表示（v1・v2）
- [x] F available() が unknown／失敗のときローカル OK とみなさない（v1・v2）
- [x] 先生テスト → コミット
- [x] push（0267232）
- [ ] 報告者へお礼・お知らせ
- [x] 「困ったときは」（sayonari_web刷新）に項目追加（2026-10-14・アップロード待ち）

## 優先度：中
- [ ] OBS 30 以前（CEF 103）で overlay.html の描画確認（擬似要素方式なので動く想定）
- [ ] 英語 UI の文言見直し，使い方ガイド（sayonari.com）の v2 対応
- [ ] Chrome 翻訳モデル DL の UX（進捗表示）

## 優先度：低
- [ ] リリック風テーマなど追加テーマ（機能を増やしすぎない範囲で）
- [ ] 表示ウィンドウのサイズ記憶

## 完了済み
- [x] 旧版精査（Claude 監査＋Codex GPT-5.6 Sol 監査）→ .output/ 参照
- [x] v2 再実装（設定画面・overlay・認識・翻訳・伏字・OBS・プリセット・i18n）
- [x] 伏字ルール見直し（単語境界）＋ goodBadWordlist 全言語更新（ローカルコミット済）
- [x] 紹介動画の全自動生成ツール
- [x] 2026-10-14 神託 PV（build_divine.mjs・Suno BGM「字幕ちゃん 神託」3:05 を 9.5 秒目から）＋X 文案 → .output/2026-10-14_神託PVとX文案.html → 声を Gemini Gacrux に・効果音を西洋風に作り直し → [x] 先生が X に投稿済（2026-10-14）
- [ ] PV ツール一式のコミット可否（未確認）
