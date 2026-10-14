/*
 * jimakuChan v2 – 翻訳（Chrome 内蔵 Translator API / 百度翻訳 / Google Apps Script プロキシ）
 *
 * translateAll(text, sourceLang, targets[]) → Promise<[{lang, text, ok, via, error}]>
 *   - method 'chrome' : Chrome 138+ の Translator API（ローカル・高速）
 *   - method 'baidu'  : 百度の通用文本翻訳 API（baiduProxyUrl 必須．代理が署名を作る）
 *   - method 'gas'    : GAS プロキシ経由 Google 翻訳（gasKey 必須）
 *   - 選んだ方法が使えない・失敗した場合は，残りを「百度 → Chrome → GAS」の順で試す
 *     （＝百度を優先して回退．どの方法を使うかは利用者が「翻訳方法」で選ぶ）
 */
(function (global) {
  'use strict';

  function gasNormalize(code) {
    if (!code) return code;
    if (/^zh-/i.test(code)) return code;      // zh-CN / zh-TW / zh-HK はそのまま
    return code.split('-')[0];
  }

  // ---- 百度の語種コード ----------------------------------------------------
  // 公式「語種リスト」に合わせてある（表に無い言語は百度を使わず，他の方法へ回す）
  const BAIDU_LANG = {
    ja: 'jp', ko: 'kor', 'zh-CN': 'zh', zh: 'zh', 'zh-TW': 'cht', 'zh-HK': 'cht',
    en: 'en', fr: 'fra', it: 'it', de: 'de', es: 'spa', pt: 'pt', ru: 'ru', uk: 'ukr',
    pl: 'pl', nl: 'nl', sv: 'swe', tr: 'tr', id: 'id', vi: 'vie', th: 'th', ar: 'ara',
    el: 'el', hi: 'hi',
  };
  function baiduLang(code) {
    if (!code) return '';
    if (BAIDU_LANG[code]) return BAIDU_LANG[code];
    const base = String(code).split('-')[0];
    return BAIDU_LANG[base] || '';
  }

  // 百度のエラーコード → 画面に出す文言
  const BAIDU_ERR = {
    '52001': 'タイムアウト（再試行）',
    '52002': '百度側のエラー（再試行）',
    '52003': 'APP ID が未認証（APP ID とサービス開通を確認）',
    '54000': 'パラメータが不足',
    '54001': '署名エラー（密钥を確認）',
    '54003': 'アクセス頻度の制限（QPS 超過．少し待つか高級版へ）',
    '54004': '残高不足',
    '54005': '長文の連投（少し間をあけてください）',
    '58000': 'クライアント IP が許可されていない',
    '58001': 'この言語方向に未対応',
    '58002': '翻訳サービスが停止中',
    '90107': '実名認証が未完了',
  };
  const BAIDU_RETRY = ['52001', '52002'];

  /** 代理 URL を整える（ルートだけ／エンドポイント全部／?token= 付き／同一オリジンのパスを受け付ける） */
  function proxyEndpoint(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    s = s.replace(/#.*$/, '');
    const qi = s.indexOf('?');
    let path = (qi >= 0 ? s.slice(0, qi) : s).replace(/\/+$/, '');
    const query = qi >= 0 ? s.slice(qi) : '';
    const absolute = /^https?:\/\//i.test(s);
    // ドメインらしくない（＝同一オリジンのパス）なら先頭の / を補う
    if (!absolute && path.charAt(0) !== '/' && path.split('/')[0].indexOf('.') < 0) path = '/' + path;
    const ep = (/\/api\/[a-z]+$/i.test(path) ? path : path + '/api/translate') + query;
    if (absolute || path.charAt(0) === '/') return ep;   // 絶対 URL／同一オリジンのパス
    return 'https://' + ep;
  }

  class Translator {
    constructor() {
      this.method = 'chrome';
      this.gasKey = '';
      this.baiduProxyUrl = '';       // 例 https://xxx.vercel.app/api/translate（?token=… も可．同一サイトなら /api/translate）
      this.baiduAppId = '';          // 代理に環境変数で入れてある場合は空でよい
      this.baiduKey = '';
      this.autoProxyUrl = '';        // 同一サイト（Vercel にまとめてデプロイ）に代理があれば自動で入る
      this._autoProxyChecked = false;
      this.count = 0;                // 今セッションの翻訳回数（GAS の累計はレスポンスから）
      this.gasTotal = null;          // GAS 側が返す累計回数
      this.onStatus = () => {};      // (text, level:'ok'|'busy'|'warn'|'err')
      this._chrome = global.chromeTranslator || null;
    }

    get chromeAvailable() { return !!(this._chrome && this._chrome.isAvailable); }
    get gasAvailable() { return !!this.gasKey; }
    get baiduAvailable() { return !!(this.baiduProxyUrl || this.autoProxyUrl); }

    /**
     * 同じサイトに /api/translate があれば自動で使う（＝リポジトリ全体を Vercel にデプロイした場合．
     * GitHub Pages など代理が無い環境では 404 になるだけで何も起きない）
     */
    async detectSameOriginProxy(force) {
      if (this._autoProxyChecked && !force) return this.autoProxyUrl;
      this._autoProxyChecked = true;
      try {
        const r = await fetch('/api/translate', { method: 'GET' });
        if (r.ok) {
          const j = await r.json();
          if (j && j.ok === true && /jimakuChan/i.test(String(j.service || ''))) {
            this.autoProxyUrl = '/api/translate';
          }
        }
      } catch (e) { /* 同一サイトに代理は無い */ }
      return this.autoProxyUrl;
    }

    async checkChrome() {
      if (!this._chrome) return false;
      try { await this._chrome.checkAvailability(); } catch (e) {}
      return this.chromeAvailable;
    }

    /** モデルの状態 'available'|'downloadable'|'downloading'|'unavailable' */
    async chromeModelStatus(src, dst) {
      if (!('Translator' in global)) return 'unavailable';
      try {
        const q = global.Translator.availability({
          sourceLanguage: this._chrome.normalizeLanguageCode(src),
          targetLanguage: this._chrome.normalizeLanguageCode(dst),
        });
        // 環境によっては応答が返らないことがあるので 4 秒で打ち切る
        return await Promise.race([q, new Promise(r => setTimeout(() => r('unknown'), 4000))]);
      } catch (e) { return 'unavailable'; }
    }

    async preloadChrome(src, dst) {
      if (!this._chrome) return false;
      return this._chrome.preloadLanguagePack(src, dst);
    }

    /** 試行順：選んだ方法 → 百度 → Chrome → GAS（使えないものは呼ぶ直前に飛ばす） */
    order() {
      const all = ['baidu', 'chrome', 'gas'];
      const first = all.indexOf(this.method);
      if (first < 0) return all;
      return [all[first]].concat(all.filter(m => m !== this.method));
    }

    async translateOne(text, src, dst) {
      if (!text) return { lang: dst, text: '', ok: true, via: 'none' };
      const cSrc = this._chrome ? this._chrome.normalizeLanguageCode(src) : gasNormalize(src);
      const cDst = this._chrome ? this._chrome.normalizeLanguageCode(dst) : gasNormalize(dst);
      if (cSrc === cDst || gasNormalize(src) === gasNormalize(dst)) {
        return { lang: dst, text, ok: true, via: 'same' };
      }
      let lastErr = null;
      for (const m of this.order()) {
        if (m === 'baidu') {
          if (!this.baiduAvailable || !baiduLang(dst)) continue;   // 未対応言語は送らない
          try {
            const out = await this._baidu(text, src, dst);
            this.count++;
            return { lang: dst, text: out, ok: true, via: 'baidu' };
          } catch (e) { lastErr = lastErr || e; console.warn('[trans] 百度翻訳失敗:', e && e.message); continue; }
        }
        if (m === 'chrome') {
          if (!this.chromeAvailable) continue;
          try {
            const out = await this._chrome.translate(text, cSrc, cDst);
            this.count++;
            return { lang: dst, text: out, ok: true, via: 'chrome' };
          } catch (e) { lastErr = lastErr || e; console.warn('[trans] Chrome 翻訳失敗:', e && e.message); continue; }
        }
        if (m === 'gas') {
          if (!this.gasAvailable) continue;
          try {
            const out = await this._gas(text, gasNormalize(src), gasNormalize(dst));
            this.count++;
            return { lang: dst, text: out, ok: true, via: 'gas' };
          } catch (e) { lastErr = lastErr || e; console.warn('[trans] GAS 翻訳失敗:', e && e.message); continue; }
        }
      }
      return { lang: dst, text: '', ok: false, via: 'none', error: lastErr ? (lastErr.message || String(lastErr)) : 'no-method' };
    }

    /** 複数言語へ並列翻訳 */
    async translateAll(text, src, targets) {
      const active = targets.map((t, i) => ({ t, i })).filter(x => x.t && x.t !== 'none');
      if (!active.length) return [];
      this.onStatus('翻訳中', 'busy');
      const results = await Promise.all(active.map(x => this.translateOne(text, src, x.t).then(r => Object.assign(r, { slot: x.i }))));
      const bad = results.filter(r => !r.ok);
      const viaLabel = { chrome: 'Chrome翻訳 完了', baidu: '百度翻訳 完了', gas: 'GAS翻訳 完了' };
      if (bad.length === 0) this.onStatus(viaLabel[results[0].via] || '翻訳 完了', 'ok');
      else this.onStatus('翻訳エラー: ' + (bad[0].error || ''), 'err');
      return results;
    }

    // ---- 百度翻訳（通用文本翻訳）----------------------------------------
    // 署名（MD5）は代理側で作るので，ここでは q / from / to と鍵を送るだけ．
    // 鍵はアプリで入力されたもの．代理の環境変数を使う場合は送らなくてよい．
    async _baidu(text, src, dst) {
      let last = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await this._baiduOnce(text, src, dst);
        } catch (e) {
          last = e;
          if (attempt === 0 && BAIDU_RETRY.indexOf(String(e && e.code)) >= 0) continue;
          throw e;
        }
      }
      throw last || new Error('百度翻訳エラー');
    }

    async _baiduOnce(text, src, dst) {
      const url = proxyEndpoint(this.baiduProxyUrl || this.autoProxyUrl);
      if (!url) throw new Error('翻訳代理が未設定');
      const body = new URLSearchParams({ q: text, from: baiduLang(src) || 'auto', to: baiduLang(dst) });
      if (this.baiduAppId) body.set('appid', this.baiduAppId);
      if (this.baiduKey) body.set('key', this.baiduKey);

      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 15000);   // 代理側は 8 秒で打ち切るので，それより長めに待つ
      let r;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          signal: ac.signal,
        });
      } catch (e) {
        throw new Error(e && e.name === 'AbortError' ? '百度翻訳タイムアウト' : '翻訳代理に接続できません');
      } finally { clearTimeout(tid); }

      if (!r.ok) {
        let msg = '';
        try { const j = await r.json(); msg = (j && (j.message || j.error)) || ''; } catch (e) {}
        if (r.status === 403) throw new Error(msg || '代理の token が違います');
        if (r.status === 400) throw new Error(msg || '代理の設定不足（APP ID・密钥）');
        throw new Error(msg || ('代理エラー HTTP ' + r.status));
      }

      let j = null;
      try { j = await r.json(); } catch (e) { throw new Error('代理の応答が不正'); }
      if (j && j.error_code) {
        const code = String(j.error_code);
        const err = new Error(BAIDU_ERR[code] || ('百度エラー ' + code + (j.error_msg ? '：' + j.error_msg : '')));
        err.code = code;
        throw err;
      }
      if (j && j.error) throw new Error(j.message || j.error);
      const tr = j && j.trans_result;
      if (Array.isArray(tr) && tr.length) return tr.map(x => x.dst).join('\n');
      throw new Error('翻訳結果が空でした');
    }

    async _gas(text, src, dst) {
      const url = 'https://script.google.com/macros/s/' + encodeURIComponent(this.gasKey) + '/exec'
        + '?text=' + encodeURIComponent(text) + '&source=' + encodeURIComponent(src) + '&target=' + encodeURIComponent(dst);
      const ac = new AbortController(); const tid = setTimeout(() => ac.abort(), 12000);
      let r;
      try { r = await fetch(url, { signal: ac.signal }); } finally { clearTimeout(tid); }
      if (!r.ok) {
        if (r.status === 429) throw new Error('API上限');
        if (r.status === 403) throw new Error('API認証エラー');
        throw new Error('HTTP ' + r.status);
      }
      const body = await r.text();
      try {
        const j = JSON.parse(body);
        if (j && j.translatedText !== undefined) {
          if (j.translatedCount !== undefined) this.gasTotal = j.translatedCount;
          return String(j.translatedText);
        }
      } catch (e) { /* プレーンテキスト応答 */ }
      return body;
    }
  }

  Translator.BAIDU_LANG = BAIDU_LANG;
  Translator.proxyEndpoint = proxyEndpoint;
  global.JimakuTranslator = Translator;
})(typeof window !== 'undefined' ? window : globalThis);
