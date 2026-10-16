/*
 * jimakuChan – 百度翻訳（通用文本翻訳 API）CORS プロキシ
 *
 * なぜプロキシが必要か：
 *   https://fanyi-api.baidu.com/api/trans/vip/translate は Access-Control-Allow-Origin を返さないため，
 *   ブラウザから直接呼ぶと CORS で弾かれる（2026-10-14 実測）．また静的サイトに密钥を置けない．
 *
 * 使い方（アプリ側から見た仕様）
 *   POST /api/translate   Content-Type: application/x-www-form-urlencoded
 *     q=翻訳するテキスト&from=jp&to=en&appid=xxx&key=yyy
 *       - appid / key は省略可（その場合は環境変数 BAIDU_APPID / BAIDU_KEY を使う）
 *   → 百度の応答 JSON をそのまま返す（{"trans_result":[{"src","dst"}]} または {"error_code","error_msg"}）
 *   GET /api/translate → {ok:true, ...}   死活確認用
 *
 * 環境変数（Vercel の Project Settings → Environment Variables）
 *   BAIDU_APPID / BAIDU_KEY : 代理側に固定で持たせる場合に設定（利用者は入力不要になる）
 *   PROXY_TOKEN             : 設定すると token の一致が必要になる（公開デプロイの悪用防止）
 *                             アプリ側は代理 URL に ?token=xxx を付ける
 *
 * 依存：Node 標準モジュールのみ（MD5 署名はここで作る．ブラウザに MD5 実装を持ち込まないため）
 */
const crypto = require('crypto');

const BAIDU_ENDPOINT = 'https://fanyi-api.baidu.com/api/trans/vip/translate';
const TIMEOUT_MS = 8000;   // Vercel Hobby の関数上限（10 秒）に収まるよう短めに切る

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Proxy-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** ボディを object に（Vercel が parse 済みならそのまま／文字列なら JSON or フォームを試す） */
function parseBody(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  const s = String(raw);
  if (s.trim().startsWith('{')) {
    try { return JSON.parse(s); } catch (e) { /* fallthrough */ }
  }
  const out = {};
  for (const [k, v] of new URLSearchParams(s)) out[k] = v;
  return out;
}

module.exports = async function handler(req, res) {
  setCors(res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      service: 'jimakuChan baidu proxy',
      version: 1,
      envKeys: !!(process.env.BAIDU_APPID && process.env.BAIDU_KEY),
      tokenRequired: !!process.env.PROXY_TOKEN,
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed', message: 'POST で呼んでください' });
    return;
  }

  if (process.env.PROXY_TOKEN) {
    const got = (req.query && req.query.token) || req.headers['x-proxy-token'] || '';
    if (String(got) !== String(process.env.PROXY_TOKEN)) {
      res.status(403).json({ error: 'forbidden', message: 'token が違います' });
      return;
    }
  }

  const body = parseBody(req.body);
  const q = String(body.q === undefined ? '' : body.q);
  const to = String(body.to === undefined ? '' : body.to);
  const from = String(body.from || 'auto');

  if (!q) { res.status(400).json({ error: 'bad-request', message: 'q（翻訳するテキスト）が必要です' }); return; }
  if (!to) { res.status(400).json({ error: 'bad-request', message: 'to（翻訳先の言語）が必要です' }); return; }

  const appid = process.env.BAIDU_APPID || String(body.appid || '');
  const key = process.env.BAIDU_KEY || String(body.key || '');
  if (!appid || !key) {
    res.status(400).json({
      error: 'no-credentials',
      message: '百度の APP ID と密钥が必要です（アプリ側で入力するか，代理の環境変数 BAIDU_APPID / BAIDU_KEY に設定してください）',
    });
    return;
  }

  const salt = String(Date.now()) + ('' + Math.random()).slice(2, 6);
  const sign = md5(appid + q + salt + key);
  const params = new URLSearchParams({ q, from, to, appid, salt, sign });

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(BAIDU_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: ac.signal,
    });
    const text = await r.text();
    // 呼び出し結果をログに残す（Vercel の Functions ログで確認できる．密钥・sign は出さない）
    console.log('[baidu] 呼び出し結果:', JSON.stringify({
      from, to, qLen: q.length, appid,
      appidSrc: process.env.BAIDU_APPID ? 'env' : 'body',   // 半分だけ env だと混ざって署名エラーになる
      keySrc: process.env.BAIDU_KEY ? 'env' : 'body',
      http: r.status, body: text.slice(0, 300),
    }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(text);           // 百度の応答をそのまま返す（error_code の解釈はアプリ側）
  } catch (e) {
    console.warn('[baidu] 呼び出しに失敗:', (e && e.message) || e);
    const aborted = e && (e.name === 'AbortError' || e.code === 'ABORT_ERR');
    res.status(aborted ? 504 : 502).json({
      error: aborted ? 'upstream-timeout' : 'upstream-error',
      message: aborted ? '百度翻訳がタイムアウトしました' : ('百度翻訳に接続できません: ' + ((e && e.message) || e)),
    });
  } finally {
    clearTimeout(tid);
  }
};
