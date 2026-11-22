// 학습 콘텐츠(JSON) 불러오기와 후리가나 처리
const cache = new Map();

function getJSON(url) {
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url);
}

export const loadTopicList = () => getJSON('content/topics.json');

export async function loadTopic(id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) return null;
  try { return await getJSON(`content/topics/${id}.json`); } catch { return null; }
}

// 후리가나 표기: {漢字|かんじ}
const RUBY = /\{([^|{}]+)\|([^{}]+)\}/g;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 화면 표시용: 한자 위에 읽는 법 */
export const toRuby = (s) => esc(s).replace(RUBY, '<ruby>$1<rt>$2</rt></ruby>');
/** 한자만 남김: 食べる */
export const toPlain = (s) => String(s ?? '').replace(RUBY, '$1');
/** 읽는 법만 남김: たべる (읽어주기용, 잘못 읽는 것 방지) */
export const toKana = (s) => String(s ?? '').replace(RUBY, '$2');
