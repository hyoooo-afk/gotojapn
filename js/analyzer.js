// 번역(한→일)과 일본어 문장 분석(품사·원형·활용) — 둘 다 무료 서비스
//  · 번역: MyMemory (https://mymemory.translated.net) — 하루 무료 한도 있음
//  · 분석: kuromoji.js 형태소 분석기 (사전은 처음 한 번 내려받고 브라우저가 기억)
import { esc, toRuby } from './content.js';

const KUROMOJI = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/';

// ===== 번역 =====
const decodeEntities = (s) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };

async function machineTranslate(text, pair) {
  const r = await fetch(`https://api.mymemory.translated.net/get?langpair=${pair}&q=${encodeURIComponent(text)}`);
  if (!r.ok) throw new Error(r.status === 429 ? 'quota' : 'network');
  const j = await r.json();
  const out = j.responseData?.translatedText || '';
  if (Number(j.responseStatus) !== 200 || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) throw new Error('quota');
  return decodeEntities(out).trim();
}

export const translateKoJa = (text) => machineTranslate(text, 'ko|ja');

const meaningCache = new Map();
/** 단어 뜻 (일→한 자동 번역, 한 번 찾은 건 기억) */
export function meaningOf(word) {
  if (!meaningCache.has(word)) {
    const p = machineTranslate(word, 'ja|ko');
    p.catch(() => meaningCache.delete(word));
    meaningCache.set(word, p);
  }
  return meaningCache.get(word);
}

// ===== 형태소 분석기 =====
let tokenizer = null;
let loading = null;
export function loadAnalyzer() {
  if (tokenizer) return Promise.resolve(tokenizer);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${KUROMOJI}build/kuromoji.js`;
    s.onload = () => window.kuromoji.builder({ dicPath: `${KUROMOJI}dict/` })
      .build((err, tk) => (err ? reject(err) : resolve((tokenizer = tk))));
    s.onerror = () => reject(new Error('analyzer'));
    document.head.append(s);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

// ===== 글자 도구 =====
const kataToHira = (s) => (s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hasKanji = (s) => /[㐀-䶿一-鿿々]/.test(s);
const readingOf = (t) => (t.reading && t.reading !== '*' ? t.reading : t.surface_form);

/** 食べ + タベ → 「{食|た}べ」 (앞뒤 가나는 빼고 한자 부분에만 읽기) */
function rubyMarkup(surface, reading) {
  if (!hasKanji(surface) || !reading || reading === '*') return surface;
  let s = surface;
  let r = kataToHira(reading);
  let head = '';
  let tail = '';
  while (s.length > 1 && r.length && !hasKanji(s.at(-1)) && kataToHira(s.at(-1)) === r.at(-1)) {
    tail = s.at(-1) + tail; s = s.slice(0, -1); r = r.slice(0, -1);
  }
  while (s.length > 1 && r.length && !hasKanji(s[0]) && kataToHira(s[0]) === r[0]) {
    head += s[0]; s = s.slice(1); r = r.slice(1);
  }
  return `${head}{${s}|${r}}${tail}`;
}

// ===== 한글 발음 =====
// 레슨 콘텐츠와 같은 표기: 장음은 「-」, っ는 ㅅ받침, ん는 뒤 소리에 따라 ㄴ/ㅁ/ㅇ 받침
const KANA2 = {
  キャ: '캬', キュ: '큐', キョ: '쿄', ギャ: '갸', ギュ: '규', ギョ: '교',
  シャ: '샤', シュ: '슈', ショ: '쇼', ジャ: '자', ジュ: '주', ジョ: '조', シェ: '셰', ジェ: '제',
  チャ: '차', チュ: '추', チョ: '초', チェ: '체', ニャ: '냐', ニュ: '뉴', ニョ: '뇨',
  ヒャ: '햐', ヒュ: '휴', ヒョ: '효', ビャ: '뱌', ビュ: '뷰', ビョ: '뵤', ピャ: '퍄', ピュ: '퓨', ピョ: '표',
  ミャ: '먀', ミュ: '뮤', ミョ: '묘', リャ: '랴', リュ: '류', リョ: '료',
  ティ: '티', ディ: '디', トゥ: '투', ドゥ: '두', テュ: '튜', デュ: '듀',
  ファ: '파', フィ: '피', フェ: '페', フォ: '포', フュ: '퓨', ツァ: '차',
  ウィ: '위', ウェ: '웨', ウォ: '워', ヴァ: '바', ヴィ: '비', ヴェ: '베', ヴォ: '보',
};
const KANA1 = {
  ア: '아', イ: '이', ウ: '우', エ: '에', オ: '오',
  カ: '카', キ: '키', ク: '쿠', ケ: '케', コ: '코', ガ: '가', ギ: '기', グ: '구', ゲ: '게', ゴ: '고',
  サ: '사', シ: '시', ス: '스', セ: '세', ソ: '소', ザ: '자', ジ: '지', ズ: '즈', ゼ: '제', ゾ: '조',
  タ: '타', チ: '치', ツ: '츠', テ: '테', ト: '토', ダ: '다', ヂ: '지', ヅ: '즈', デ: '데', ド: '도',
  ナ: '나', ニ: '니', ヌ: '누', ネ: '네', ノ: '노',
  ハ: '하', ヒ: '히', フ: '후', ヘ: '헤', ホ: '호', バ: '바', ビ: '비', ブ: '부', ベ: '베', ボ: '보',
  パ: '파', ピ: '피', プ: '푸', ペ: '페', ポ: '포',
  マ: '마', ミ: '미', ム: '무', メ: '메', モ: '모', ヤ: '야', ユ: '유', ヨ: '요',
  ラ: '라', リ: '리', ル: '루', レ: '레', ロ: '로', ワ: '와', ヲ: '오', ヴ: '부',
  ァ: '아', ィ: '이', ゥ: '우', ェ: '에', ォ: '오', ャ: '야', ュ: '유', ョ: '요', ヮ: '와',
  ー: '-', '。': '.', '、': ',', '？': '?', '！': '!', '　': ' ',
};
const hiraToKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/** 앞 글자에 받침 붙이기 (ㄴ=4, ㅁ=16, ㅅ=19, ㅇ=21) */
function addFinal(str, final) {
  const code = str.charCodeAt(str.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 0) {
    return str.slice(0, -1) + String.fromCharCode(code + final);
  }
  return null;
}

/** カタカナ/ひらがな → 한글 발음 */
export function kanaToHangul(kana) {
  const s = hiraToKata(kana);
  let out = '';
  for (let i = 0; i < s.length;) {
    const two = s.slice(i, i + 2);
    if (KANA2[two]) { out += KANA2[two]; i += 2; continue; }
    const c = s[i];
    if (c === 'ン') {
      const next = s.slice(i + 1).trimStart()[0] || '';
      const final = /[カキクケコガギグゲゴ]/.test(next) ? 21 : /[マミムメモバビブベボパピプペポ]/.test(next) ? 16 : 4;
      out = addFinal(out, final) ?? `${out}은`;
    } else if (c === 'ッ') {
      out = addFinal(out, 19) ?? out;
    } else {
      out += KANA1[c] ?? c;
    }
    i++;
  }
  return out;
}

// 실제 발음 (は→ワ, を→オ, 장음 ー 반영)
const soundOf = (p) => (p.pronunciation && p.pronunciation !== '*' ? p.pronunciation : p.surface_form);

/** 문장 전체 한글 발음. 조사·조동사는 앞말에 붙이고 단어 사이는 띄움 */
export function pronOf(chunks) {
  let kana = '';
  chunks.forEach((c, i) => {
    if (i > 0 && !['particle', 'aux', 'symbol'].includes(c.kind)) kana += ' ';
    kana += c.parts.map(soundOf).join('');
  });
  return kanaToHangul(kana)
    .replace(/\s+([.,?!])/g, '$1')
    .replace(/([.,?!])(?=[^\s.,?!])/g, '$1 ')
    .trim();
}

// ===== 품사 =====
export const POS = {
  noun: { label: '명사', color: '#0066e0' },
  proper: { label: '고유명사', color: '#0066e0' },
  pron: { label: '대명사', color: '#0066e0' },
  num: { label: '수사', color: '#0066e0' },
  verb: { label: '동사', color: '#d6336c' },
  adj: { label: 'い형용사', color: '#1f9d55' },
  adjna: { label: 'な형용사', color: '#1f9d55' },
  particle: { label: '조사', color: '#8c8c8c' },
  aux: { label: '조동사', color: '#7a5af8' },
  adverb: { label: '부사', color: '#be4e04' },
  prenoun: { label: '연체사', color: '#0f9fb5' },
  conj: { label: '접속사', color: '#0f9fb5' },
  interj: { label: '감탄사', color: '#0f9fb5' },
  prefix: { label: '접두사', color: '#0f9fb5' },
  other: { label: '기타', color: '#0f9fb5' },
};

function kindOf(t) {
  switch (t.pos) {
    case '名詞':
      return { 代名詞: 'pron', 数: 'num', 形容動詞語幹: 'adjna', 固有名詞: 'proper' }[t.pos_detail_1] || 'noun';
    case '動詞': return 'verb';
    case '形容詞': return 'adj';
    case '助詞': return 'particle';
    case '助動詞': return 'aux';
    case '副詞': return 'adverb';
    case '連体詞': return 'prenoun';
    case '接続詞': return 'conj';
    case '感動詞': return 'interj';
    case '接頭詞': return 'prefix';
    case '記号': return 'symbol';
    default: return 'other';
  }
}

// 동사·형용사 뒤에 붙어서 모양을 바꾸는 것들 (하나의 덩어리로 묶음)
const isChainPart = (t) => t.pos === '助動詞'
  || (t.pos === '助詞' && t.pos_detail_1 === '接続助詞' && (t.surface_form === 'て' || t.surface_form === 'で'))
  || (t.pos === '動詞' && (t.pos_detail_1 === '非自立' || t.pos_detail_1 === '接尾'))
  || (t.pos === '形容詞' && t.pos_detail_1 === '非自立');

/** 문장을 클릭할 수 있는 단어 덩어리로 나눔 */
export function analyze(ja) {
  const tokens = tokenizer.tokenize(ja);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let kind = kindOf(t);
    const parts = [t];
    const next = tokens[i + 1];
    // 勉強 + する → 동사 하나 (勉強する)
    if (t.pos === '名詞' && t.pos_detail_1 === 'サ変接続' && next?.pos === '動詞' && next.basic_form === 'する') {
      kind = 'verb';
      parts.push(next);
      i++;
    }
    if (kind === 'verb' || kind === 'adj' || (kind === 'adjna' && tokens[i + 1]?.pos === '助動詞')) {
      while (tokens[i + 1] && isChainPart(tokens[i + 1])) parts.push(tokens[++i]);
    }
    out.push({
      kind,
      parts,
      surface: parts.map((p) => p.surface_form).join(''),
      markup: parts.map((p) => rubyMarkup(p.surface_form, p.reading)).join(''),
    });
  }
  return out;
}

// ===== 설명 사전 =====
const CONJ_TYPE = (ct = '') => (
  ct.startsWith('五段') ? '5단 동사 (う동사)'
    : ct.startsWith('一段') ? '1단 동사 (る동사)'
      : ct.startsWith('サ変') ? 'する 동사 (불규칙)'
        : ct.startsWith('カ変') ? '来る 동사 (불규칙)'
          : ct.startsWith('形容詞') ? 'い형용사' : '');

const CONJ_FORM = {
  基本形: '기본형 (사전에 나오는 꼴)',
  連用形: '연용형 (ます·た·て 등이 붙는 꼴)',
  連用タ接続: '연용형 음편 (た·て가 붙으며 소리가 바뀐 꼴)',
  連用テ接続: '연용형 (て·ない·なる가 붙는 꼴)',
  連用デ接続: '연용형 (で가 붙는 꼴)',
  連用ゴザイ接続: '연용형 (ございます가 붙는 꼴)',
  未然形: '미연형 (ない·れる 등이 붙는 꼴)',
  未然ウ接続: '의지형 꼴 (う가 붙는 꼴)',
  未然ヌ接続: '미연형 (ぬ가 붙는 꼴)',
  未然レル接続: '미연형 (れる가 붙는 꼴)',
  仮定形: '가정형 (ば가 붙는 꼴)',
  仮定縮約１: '가정형 축약 (구어)',
  命令ｅ: '명령형', 命令ｒｏ: '명령형', 命令ｙｏ: '명령형', 命令ｉ: '명령형',
  体言接続: '명사 수식형',
  音便基本形: '기본형 (음편)',
  ガル接続: '어간 (がる가 붙는 꼴)',
};

// [짧은 이름, 뜻]
const AUX = {
  ます: ['정중', '~ㅂ니다 / ~요'],
  た: ['과거·완료', '~했다'],
  だ: ['단정', '~이다'],
  です: ['정중 단정', '~입니다'],
  ない: ['부정', '~지 않다'],
  ぬ: ['부정', '~지 않-'],
  ん: ['부정', '~지 않- (ません의 ん)'],
  たい: ['희망', '~하고 싶다'],
  たがる: ['남의 희망', '~하고 싶어하다'],
  う: ['의지·권유', '~하자 / ~합시다'],
  よう: ['의지·권유', '~하자'],
  まい: ['부정 의지', '~하지 않겠다'],
  れる: ['수동·가능', '~되다 / ~할 수 있다'],
  られる: ['수동·가능·존경', '~되다 / ~할 수 있다'],
  せる: ['사역', '~하게 하다'],
  させる: ['사역', '~하게 하다'],
  らしい: ['추측', '~인 것 같다'],
  そうだ: ['양태·전문', '~할 것 같다 / ~라고 한다'],
  ようだ: ['추측·비유', '~인 듯하다'],
  て: ['연결', '~하고 / ~해서'],
  で: ['연결', '~하고 / ~해서'],
  いる: ['진행·상태', '~하고 있다'],
  ある: ['상태', '~되어 있다'],
  しまう: ['완료·유감', '~해 버리다'],
  ちゃう: ['완료·유감 (구어)', '~해 버리다'],
  おく: ['미리 함', '~해 두다'],
  とく: ['미리 함 (구어)', '~해 두다'],
  みる: ['시도', '~해 보다'],
  くる: ['변화·접근', '~해 오다'],
  いく: ['진행', '~해 가다'],
  くれる: ['나에게 해 줌', '~해 주다'],
  あげる: ['남에게 해 줌', '~해 주다'],
  もらう: ['받음', '~해 받다'],
  ほしい: ['바람', '~해 주길 바라다'],
  なる: ['변화', '~하게 되다'],
};

const PARTICLE = {
  は: '주제 · ~은/는 (발음은 「わ」)',
  が: '주어 · ~이/가 (문장을 이으면 ~지만)',
  を: '목적어 · ~을/를 (발음은 「お」)',
  に: '시간·장소·대상 · ~에 / ~에게',
  で: '장소·수단 · ~에서 / ~로',
  へ: '방향 · ~로 / ~에 (발음은 「え」)',
  と: '함께·인용 · ~와/과, ~라고',
  も: '추가 · ~도',
  の: '소유·연결 · ~의 (문장 끝이면 질문·설명)',
  から: '출발·이유 · ~부터, ~니까',
  まで: '끝 · ~까지',
  より: '비교 · ~보다',
  や: '나열 · ~랑, ~이나',
  か: '의문 · ~까?',
  ね: '동의·확인 · ~네요, ~죠',
  よ: '알림·강조 · ~요, ~거든요',
  けど: '역접 · ~지만, ~는데',
  けれど: '역접 · ~지만',
  けれども: '역접 · ~지만',
  ので: '이유 · ~라서',
  のに: '역접 · ~인데도',
  し: '나열 · ~하고',
  ながら: '동시 · ~하면서',
  ば: '가정 · ~하면',
  って: '인용·주제 (구어) · ~래, ~라는 건',
  な: '감탄·금지 · ~구나, ~하지 마',
  わ: '강조 (구어) · ~야, ~네',
  さ: '강조 (구어) · ~말이야',
  ぞ: '강한 강조 · ~다!',
  ぜ: '강한 강조 · ~자!',
  かな: '혼잣말 의문 · ~일까?',
  たり: '예시 나열 · ~하거나',
  ても: '양보 · ~해도',
  でも: '예시·양보 · ~라도',
  だけ: '한정 · ~만',
  しか: '한정 (부정과 함께) · ~밖에',
  ほど: '정도 · ~만큼',
  くらい: '정도 · ~정도',
  ぐらい: '정도 · ~정도',
  など: '예시 · ~등',
  ずつ: '나눔 · ~씩',
};

function auxInfo(p) {
  if (p.basic_form === 'だ' && p.conjugated_form === '体言接続') return ['명사 수식', '~한 (+명사)'];
  return AUX[p.basic_form] || null;
}

const row = (k, v) => `<p class="wp-row"><span class="fb-k">${k}</span><span>${v}</span></p>`;
const jp = (s) => `<span lang="ja">${esc(s)}</span>`;
const hira = (tokens) => kataToHira(tokens.map(readingOf).join(''));

/** 단어 설명 박스 내용. 뜻을 찾아야 하는 단어는 .wp-mean[data-word]로 표시 */
export function explainHTML(c) {
  const head = c.parts[0];
  const info = POS[c.kind] || POS.other;
  const reading = hira(c.parts);
  let body = '';
  let lookup = '';

  if (c.kind === 'verb' || c.kind === 'adj' || c.kind === 'adjna') {
    const isSuru = head.pos === '名詞' && c.parts[1]?.basic_form === 'する';
    const typeTok = isSuru ? c.parts[1] : head;
    const stemCount = isSuru ? 2 : 1;
    const base = isSuru ? `${head.surface_form}する` : c.kind === 'adjna' ? `${head.surface_form}だ` : head.basic_form;
    const baseReading = kataToHira(tokenizer.tokenize(base).map(readingOf).join(''));
    const type = c.kind === 'adjna' ? 'な형용사' : CONJ_TYPE(typeTok.conjugated_type) || info.label;
    const stem = c.parts.slice(0, stemCount).map((p) => p.surface_form).join('');
    const chain = c.parts.slice(stemCount);
    lookup = isSuru ? head.surface_form : c.kind === 'adjna' ? head.surface_form : base;

    body += row('원형', `${jp(base)}${baseReading !== base ? ` <span class="meta">(${esc(baseReading)})</span>` : ''} · ${type}`);
    if (chain.length || typeTok.conjugated_form !== '基本形') {
      const stemForm = c.kind === 'adjna' ? '어간' : CONJ_FORM[typeTok.conjugated_form] || typeTok.conjugated_form;
      body += row('변화', `${jp(base)} → ${[stem, ...chain.map((p) => p.surface_form)].map((s) => `<b lang="ja">${esc(s)}</b>`).join(' + ')}`);
      body += `<ul class="wp-parts">
        <li><b lang="ja">${esc(stem)}</b>${esc(stemForm)}</li>
        ${chain.map((p) => {
          const a = auxInfo(p);
          const baseNote = p.basic_form !== p.surface_form ? `(${esc(p.basic_form)}) ` : '';
          return `<li><b lang="ja">${esc(p.surface_form)}</b>${baseNote}${a ? `${esc(a[0])} · ${esc(a[1])}` : esc(p.pos)}</li>`;
        }).join('')}
      </ul>`;
      const shorts = chain.map(auxInfo).filter(Boolean).map((a) => a[0]);
      if (shorts.length) body += `<p class="wp-sum">→ ${esc(shorts.join(' + '))}</p>`;
    } else {
      body += row('변화', '바뀌지 않은 기본형');
    }
  } else if (c.kind === 'particle') {
    body += row('역할', esc(PARTICLE[head.basic_form] || '조사'));
  } else if (c.kind === 'aux') {
    const a = auxInfo(head);
    body += row('역할', a ? `${esc(a[0])} · ${esc(a[1])}` : '조동사');
    if (head.basic_form !== head.surface_form) body += row('원형', jp(head.basic_form));
  } else {
    lookup = head.basic_form !== '*' ? head.basic_form : c.surface;
  }

  return `<div class="wp-head">
      <span class="wp-word" lang="ja">${toRuby(c.markup)}</span>
      <span class="pos-chip" style="--pc:${info.color}">${info.label}</span>
      <button class="wp-close" type="button" aria-label="닫기">✕</button>
    </div>
    ${reading !== c.surface ? row('읽기', jp(reading)) : ''}
    ${row('발음', `<span class="wp-pron">${esc(kanaToHangul(c.parts.map(soundOf).join('')))}</span>`)}
    ${lookup ? row('뜻', `<span class="wp-mean" data-word="${esc(lookup)}">찾는 중…</span> <span class="meta">(자동 번역)</span>`) : ''}
    ${body}`;
}
