// 百度翻訳対応の回帰テスト
//   (1) Vercel 代理（proxy/baidu_proxy/api/translate.js）のユニットテスト
//   (2) v2 翻訳エンジン（v2/js/translator.js）の動作テスト（fetch はスタブ）
//   (3) v2 設定画面の UI 配線（Playwright・file:// で開く／サーバー不要）
//
// 実行：v2/tools/promo_video で `node test_baidu.mjs`
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// playwright が無い環境では (3) の UI テストだけスキップする
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch (e) { /* スキップ */ }

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));   // リポジトリ直下
const ORIG_FETCH = globalThis.fetch;

let pass = 0, fail = 0;
const check = (cond, msg, extra) => {
  if (cond) { pass++; console.log('OK  ' + msg); }
  else { fail++; console.log('NG  ' + msg + (extra !== undefined ? ' :: ' + extra : '')); }
};
const resp = (obj, status = 200) => {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return { ok: status < 400, status, json: async () => JSON.parse(body), text: async () => body };
};

// ============================================================
console.log('== (1) 代理（proxy/baidu_proxy/api/translate.js）==');
const handler = require(ROOT + 'proxy/baidu_proxy/api/translate.js');
const rootHandler = require(ROOT + 'api/translate.js');
check(typeof rootHandler === 'function' && rootHandler === handler, 'ルート api/translate.js が代理の実体を読み込む（Vercel 一括デプロイ用）');
function mockRes() {
  const r = { headers: {}, code: 0, body: '' };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.body = JSON.stringify(o); return r; };
  r.send = (s) => { r.body = String(s); return r; };
  r.end = () => r;
  return r;
}
const call = async (req) => { const res = mockRes(); await handler(req, res); return res; };

delete process.env.BAIDU_APPID; delete process.env.BAIDU_KEY; delete process.env.PROXY_TOKEN;

let r = await call({ method: 'OPTIONS', headers: {}, query: {} });
check(r.code === 204, 'OPTIONS は 204');
check(r.headers['access-control-allow-origin'] === '*', 'CORS ヘッダ（Access-Control-Allow-Origin: *）');

r = await call({ method: 'GET', headers: {}, query: {} });
check(r.code === 200 && /"ok":true/.test(r.body), 'GET は死活確認 JSON');

r = await call({ method: 'POST', headers: {}, query: {}, body: {} });
check(r.code === 400 && /bad-request/.test(r.body), 'q なしは 400');

r = await call({ method: 'POST', headers: {}, query: {}, body: { q: 'hello', to: 'zh' } });
check(r.code === 400 && /no-credentials/.test(r.body), '鍵なしは 400 no-credentials');

// 実ネットワーク：ダミー鍵でも百度が JSON を返す（＝要求形式が受け付けられている）
r = await call({ method: 'POST', headers: {}, query: {}, body: 'q=hello&from=en&to=zh&appid=dummy&key=dummy' });
let j = null; try { j = JSON.parse(r.body); } catch (e) {}
check(!!j && (j.error_code !== undefined || r.code >= 500), 'urlencoded ボディで百度へ到達（HTTP ' + r.code + ' / ' + String(r.body).slice(0, 80) + '）');

process.env.PROXY_TOKEN = 'secret';
r = await call({ method: 'POST', headers: {}, query: {}, body: { q: 'hi', to: 'zh' } });
check(r.code === 403, 'PROXY_TOKEN 不一致は 403');
r = await call({ method: 'POST', headers: {}, query: { token: 'secret' }, body: { q: 'hi', to: 'zh' } });
check(r.code === 400 && /no-credentials/.test(r.body), 'PROXY_TOKEN 一致なら次へ進む');
delete process.env.PROXY_TOKEN;

process.env.BAIDU_APPID = 'env-id'; process.env.BAIDU_KEY = 'env-key';
r = await call({ method: 'POST', headers: {}, query: {}, body: { q: 'hello', from: 'en', to: 'zh' } });
check(r.code === 200 && /error_code|trans_result/.test(r.body), '環境変数の鍵だけで百度へ到達');
delete process.env.BAIDU_APPID; delete process.env.BAIDU_KEY;

// ============================================================
console.log('== (2) v2 翻訳エンジン ==');
globalThis.chromeTranslator = {
  isAvailable: true,
  normalizeLanguageCode: (c) => String(c).split('-')[0],
  translate: async (t, s, d) => 'CHROME:' + d + ':' + t,
};
require(ROOT + 'v2/js/translator.js');
const T = globalThis.JimakuTranslator;

let lastReq = null;
const stub = (routes) => {
  globalThis.fetch = async (url, opts) => {
    lastReq = { url: String(url), opts };
    const key = Object.keys(routes).find(k => String(url).startsWith(k));
    if (!key) throw new TypeError('fetch failed');
    const v = routes[key];
    return typeof v === 'function' ? v(url, opts) : resp(v.body !== undefined ? v.body : v, v.status || 200);
  };
};

check(T.proxyEndpoint('https://x.vercel.app') === 'https://x.vercel.app/api/translate', 'ルート URL に /api/translate を補う');
check(T.proxyEndpoint('https://x.vercel.app/api/translate?token=t') === 'https://x.vercel.app/api/translate?token=t', 'token を保持する');
check(T.proxyEndpoint('x.vercel.app/?token=t') === 'https://x.vercel.app/api/translate?token=t', 'scheme なし＋token も整形');

const tr = new T();
tr.method = 'baidu'; tr.baiduProxyUrl = 'https://p.vercel.app'; tr.baiduAppId = 'myid'; tr.baiduKey = 'mykey';
stub({ 'https://p.vercel.app/api/translate': { body: { from: 'jp', to: 'en', trans_result: [{ src: 'あ', dst: 'Ah' }] } } });
let res = await tr.translateOne('あ', 'ja', 'en');
check(res.ok && res.via === 'baidu' && res.text === 'Ah', '百度で翻訳できる（via=baidu）');
let b = new URLSearchParams(lastReq.opts.body);
check(b.get('from') === 'jp' && b.get('to') === 'en' && b.get('appid') === 'myid' && b.get('key') === 'mykey', '語種コード（ja→jp）と鍵を送る');
check(lastReq.opts.method === 'POST' && /x-www-form-urlencoded/.test(lastReq.opts.headers['Content-Type']), 'POST + urlencoded で送る');

res = await tr.translateOne('あ', 'ja', 'zh-TW');
b = new URLSearchParams(lastReq.opts.body);
check(res.ok && b.get('to') === 'cht', 'zh-TW → cht');

stub({ 'https://p.vercel.app/api/translate': { body: { error_code: '54003', error_msg: 'query frequency limit' } } });
res = await tr.translateOne('あ', 'ja', 'en');
check(res.ok && res.via === 'chrome', '百度 54003 なら Chrome へ回退');

lastReq = null;
res = await tr.translateOne('あ', 'ja', 'xx-YY');
check(res.ok && res.via === 'chrome' && lastReq === null, '百度に未対応の言語は百度へ送らない');

let n = 0;
stub({ 'https://p.vercel.app/api/translate': () => { n++; return n === 1 ? resp({ error_code: '52001' }) : resp({ trans_result: [{ dst: 'retry-ok' }] }); } });
res = await tr.translateOne('あ', 'ja', 'en');
check(res.ok && res.text === 'retry-ok' && n === 2, '52001 は 1 回だけ再試行（呼び出し ' + n + ' 回）');

const tr2 = new T();
tr2.method = 'baidu'; tr2.baiduProxyUrl = 'https://p.vercel.app'; tr2.gasKey = 'GK'; tr2._chrome = null;
stub({
  'https://p.vercel.app/api/translate': { body: { error_code: '54001', error_msg: 'Invalid Sign' } },
  'https://script.google.com': () => { throw new TypeError('gas down'); },
});
res = await tr2.translateOne('あ', 'ja', 'en');
check(!res.ok && /署名エラー/.test(res.error), '全滅時は百度のエラー文言（' + res.error + '）');

stub({});
res = await tr2.translateOne('あ', 'ja', 'en');
check(!res.ok && /代理に接続できません/.test(res.error), '代理へ到達できないときの文言');

const tr3 = new T();
tr3.method = 'baidu'; tr3.baiduProxyUrl = ''; tr3.gasKey = 'GK'; tr3._chrome = null;
stub({ 'https://script.google.com': { body: 'GAS-TEXT' } });
res = await tr3.translateOne('あ', 'ja', 'en');
check(res.ok && res.via === 'gas' && res.text === 'GAS-TEXT', '代理未設定なら GAS へ回退');

const tr4 = new T();
tr4.method = 'chrome'; tr4._chrome = null; tr4.baiduProxyUrl = 'https://p.vercel.app';
stub({ 'https://p.vercel.app/api/translate': { body: { trans_result: [{ dst: 'BY-BAIDU' }] } } });
res = await tr4.translateOne('あ', 'ja', 'en');
check(res.ok && res.via === 'baidu', 'Chrome 不可なら百度へ回退する');

const tr5 = new T();
tr5.method = 'baidu'; tr5.baiduProxyUrl = 'https://p.vercel.app';
stub({ 'https://p.vercel.app/api/translate': { body: { trans_result: [{ dst: 'OK' }] } } });
const statusSeen = [];
tr5.onStatus = (t) => statusSeen.push(t);
const out = await tr5.translateAll('あ', 'ja', ['en', 'none', 'none']);
check(out.length === 1 && out[0].via === 'baidu' && statusSeen.includes('百度翻訳 完了'), 'translateAll が「百度翻訳 完了」を出す');

// 同一サイト（リポジトリ全体を Vercel にデプロイ）の自動検出
check(T.proxyEndpoint('/api/translate') === '/api/translate', '同一オリジンの絶対パスをそのまま使う');
check(T.proxyEndpoint('api/translate') === '/api/translate', 'ドメインでないパスは同一オリジン扱い');

const tr6 = new T(); tr6.baiduProxyUrl = '';
stub({ '/api/translate': { body: { ok: true, service: 'jimakuChan baidu proxy' } } });
check((await tr6.detectSameOriginProxy()) === '/api/translate' && tr6.baiduAvailable, '同一サイトの代理を自動検出する');

const tr7 = new T(); tr7.baiduProxyUrl = '';
stub({ '/api/translate': { status: 404, body: {} } });
check((await tr7.detectSameOriginProxy()) === '' && !tr7.baiduAvailable, '代理が無いサイトでは未設定のまま');

const tr8 = new T(); tr8.method = 'baidu'; tr8._chrome = null; tr8.gasKey = '';
let autoCalls = 0;
stub({ '/api/translate': () => { autoCalls++; return autoCalls === 1 ? resp({ ok: true, service: 'jimakuChan baidu proxy' }) : resp({ trans_result: [{ dst: 'AUTO-OK' }] }); } });
await tr8.detectSameOriginProxy();
res = await tr8.translateOne('あ', 'ja', 'en');
check(res.ok && res.via === 'baidu' && res.text === 'AUTO-OK', '自動検出した同一サイトの代理で翻訳できる（呼び出し ' + autoCalls + ' 回）');

globalThis.fetch = ORIG_FETCH;

// ============================================================
console.log('== (3) v2 設定画面の UI（Playwright）==');
if (!chromium) {
  console.log('SKIP  playwright が無いため UI テストはスキップ（npm i playwright で実行できる）');
} else {
  const root = new URL('../../', import.meta.url).href;   // v2/
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(root + 'index.html');
  await p.waitForTimeout(2000);

  check(errs.length === 0, 'ページエラーなし', errs.join(' | '));
  const seg = await p.$$eval('[data-seg="translationMethod"] button', bs => bs.map(x => x.dataset.val));
  check(JSON.stringify(seg) === JSON.stringify(['chrome', 'baidu', 'gas']), '翻訳方法は 3 択（chrome/baidu/gas）: ' + seg.join(','));
  check(await p.$('#rowBaidu') !== null && await p.$('#rowBaiduKeys') !== null, '百度の入力欄（代理 URL・APP ID・密钥）がある');
  const st0 = await p.$eval('#baiduStatus', e => e.textContent.trim());
  check(st0.length > 0, '代理の状態が表示される（' + st0 + '）');

  await p.click('[data-seg="translationMethod"] button[data-val="baidu"]');
  await p.waitForTimeout(300);
  const ui = await p.evaluate(() => ({
    method: window.jimakuApp.S.translationMethod,
    trMethod: window.jimakuApp.engine.translator.method,
  }));
  check(ui.method === 'baidu' && ui.trMethod === 'baidu', '「百度翻訳」を選ぶと設定と翻訳器に入る: ' + JSON.stringify(ui));

  await p.fill('[data-bind="baiduProxyUrl"]', 'https://example.vercel.app');
  await p.fill('[data-bind="baiduAppId"]', 'id123');
  await p.fill('[data-bind="baiduKey"]', 'key123');
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => ({
    saved: window.jimakuApp.S.baiduProxyUrl,
    tr: window.jimakuApp.engine.translator.baiduProxyUrl,
    avail: window.jimakuApp.engine.translator.baiduAvailable,
    label: document.getElementById('baiduStatus').textContent.trim(),
  }));
  check(st.saved === 'https://example.vercel.app' && st.tr === st.saved && st.avail, '代理 URL が翻訳器に渡る: ' + JSON.stringify(st));
  check(/設定済み|ready/.test(st.label), '状態表示が「設定済み」に変わる（' + st.label + '）');

  await p.click('#langEn'); await p.waitForTimeout(300);
  check((await p.$eval('#baiduStatus', e => e.textContent.trim())).length > 0, '英語 UI でも表示できる');
  await p.click('#langJa');

  await browser.close();
}

console.log('\n' + (fail ? 'NG' : 'ALL PASS') + '  pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
