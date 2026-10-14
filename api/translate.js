/*
 * リポジトリ全体（フロント＋この API）を Vercel にデプロイするときの入り口．
 *
 *   https://<project>.vercel.app/        … jimakuChan 本体（index.html / v2/ …）
 *   https://<project>.vercel.app/api/translate … 百度翻訳の CORS 代理（同一オリジン）
 *
 * 実体は proxy/baidu_proxy/api/translate.js（あちら単体でもデプロイできるようにそちらが本体）．
 * 同一オリジンなので CORS は不要になるが，別サイトのアプリからも使えるようにヘッダはそのまま返す．
 */
module.exports = require('../proxy/baidu_proxy/api/translate.js');
