// 번역 탭: 한국어 문장 → 일본어 회화체 + 단어마다 눌러서 설명 보기
import { toKana, toRuby, esc } from './content.js';
import { speak } from './speech.js';
import {
  getSettings, getTranslations, saveTranslation, inReview, addReview, removeReview,
} from './storage.js';
import { grade } from './compare.js';
import { answerBox, feedbackHTML, toast } from './practice.js';
import {
  translateKoJa, meaningOf, loadAnalyzer, analyze, explainHTML, pronOf, POS,
} from './analyzer.js';
import { icons } from './icons.js';

const MAX = 300;

export function renderTranslate(app) {
  const settings = getSettings();
  app.innerHTML = `
    <header class="app-head"><div><p class="greet">한국어 → 일본어 회화</p><h1 class="large-title">번역</h1></div></header>
    <form class="tr-box" id="form">
      <textarea id="src" rows="3" maxlength="${MAX}" aria-label="번역할 한국어 문장"
        placeholder="한국어 문장을 입력하세요&#10;예: 오늘 저녁에 같이 밥 먹을래?"></textarea>
      <div class="tr-bar">
        <span class="meta" id="len">0 / ${MAX}</span>
        <button class="btn-primary btn-sm" type="submit">${icons.translate}번역</button>
      </div>
    </form>
    <div id="result"></div>
    <div id="history"></div>`;

  const form = app.querySelector('#form');
  const src = app.querySelector('#src');
  const len = app.querySelector('#len');
  const result = app.querySelector('#result');
  const history = app.querySelector('#history');

  // 첫 번역이 빨라지도록 분석기를 미리 불러둠
  loadAnalyzer().catch(() => {});

  src.addEventListener('input', () => { len.textContent = `${src.value.length} / ${MAX}`; });
  src.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ko = src.value.trim();
    if (!ko) { src.focus(); return; }
    result.innerHTML = '<section class="tr-result"><p class="meta">번역하는 중…</p></section>';
    try {
      const ja = await translateKoJa(ko);
      saveTranslation(ko, ja);
      await showResult(ko, ja);
      showHistory();
    } catch (err) {
      result.innerHTML = `<section class="tr-result"><p class="warn">${err.message === 'quota'
        ? '오늘 무료 번역 한도를 다 썼어요. 내일 다시 해 주세요.'
        : '번역하지 못했어요. 인터넷 연결을 확인해 주세요.'}</p></section>`;
    }
  });

  async function showResult(ko, ja) {
    let chunks = null;
    try {
      await loadAnalyzer();
      chunks = analyze(ja);
    } catch { /* 분석기 없이 문장만 보여줌 */ }
    if (!result.isConnected) return;

    const markup = chunks ? chunks.map((c) => c.markup).join('') : ja;
    const key = `translate|${markup}`;
    const kinds = chunks ? [...new Set(chunks.map((c) => c.kind).filter((k) => POS[k]))] : [];

    result.innerHTML = `
      <section class="tr-result ${settings.furigana ? '' : 'hide-furigana'} ${settings.pron ? '' : 'hide-pron'}" id="card">
        <p class="tr-src">${esc(ko)}</p>
        <p class="tr-ja" lang="ja">${chunks
          ? chunks.map((c, i) => (POS[c.kind]
            ? `<button class="tok" type="button" data-i="${i}" style="--pc:${POS[c.kind].color}"
                aria-label="${esc(c.surface)}, ${POS[c.kind].label} 설명 보기">${toRuby(c.markup)}</button>`
            : `<span class="sym">${esc(c.surface)}</span>`)).join('')
          : esc(ja)}</p>
        ${chunks ? `<p class="pron tr-pron">${esc(pronOf(chunks))}</p>` : ''}
        ${chunks
          ? `<p class="legend">${kinds.map((k) => `<span style="--pc:${POS[k].color}">${POS[k].label}</span>`).join('')}</p>
             <p class="meta">단어를 누르면 품사·원형·변화 설명이 나와요</p>`
          : '<p class="warn">단어 분석기를 불러오지 못해서 문장만 보여줘요.</p>'}
        <div class="tr-tools">
          <button class="ghost" type="button" id="say">${icons.speaker}듣기</button>
          <button class="ghost" type="button" id="practice">${icons.mic}따라 말하기</button>
          <button class="ghost" type="button" id="save"></button>
        </div>
        <div id="practiceBox"></div>
        <div class="word-pop" id="pop" hidden role="dialog" aria-label="단어 설명"></div>
      </section>`;

    const card = result.querySelector('#card');
    const pop = card.querySelector('#pop');
    const saveBtn = card.querySelector('#save');

    // 듣기
    card.querySelector('#say').addEventListener('click', () => speak(toKana(markup), settings.rate));

    // 따라 말하기
    card.querySelector('#practice').addEventListener('click', () => {
      const boxWrap = card.querySelector('#practiceBox');
      if (boxWrap.childElementCount) { boxWrap.innerHTML = ''; return; }
      const fb = document.createElement('div');
      boxWrap.append(answerBox((texts) => { fb.innerHTML = feedbackHTML(grade(markup, texts)); }), fb);
      speak(toKana(markup), settings.rate);
    });

    // 복습 카드에 담기
    const paintSave = () => {
      const on = inReview(key);
      saveBtn.innerHTML = on ? `${icons.check}담았어요` : `${icons.plus}복습 카드`;
      saveBtn.setAttribute('aria-pressed', on);
    };
    paintSave();
    saveBtn.addEventListener('click', () => {
      if (inReview(key)) { removeReview(key); toast('복습 카드에서 뺐어요'); }
      else { addReview(key, { topicId: 'translate', ja: markup, ko }); toast('복습 카드에 담았어요'); }
      paintSave();
    });

    if (!chunks) return;

    // 단어 설명 박스
    let openIndex = -1;
    const close = () => {
      openIndex = -1;
      pop.hidden = true;
      card.querySelectorAll('.tok.on').forEach((t) => t.classList.remove('on'));
    };

    function open(tok, i) {
      close();
      openIndex = i;
      tok.classList.add('on');
      pop.innerHTML = explainHTML(chunks[i]);
      pop.hidden = false;
      // 누른 단어 바로 아래에 위치
      const w = pop.offsetWidth;
      const center = tok.offsetLeft + tok.offsetWidth / 2;
      const left = Math.max(12, Math.min(center - w / 2, card.clientWidth - w - 12));
      pop.style.left = `${left}px`;
      pop.style.top = `${tok.offsetTop + tok.offsetHeight + 10}px`;
      pop.style.setProperty('--caret', `${center - left}px`);
      pop.querySelector('.wp-close').addEventListener('click', close);

      const mean = pop.querySelector('.wp-mean');
      if (mean) {
        meaningOf(mean.dataset.word)
          .then((m) => { if (openIndex === i) mean.textContent = m; })
          .catch(() => { if (openIndex === i) mean.textContent = '뜻을 불러오지 못했어요'; });
      }
    }

    card.addEventListener('click', (e) => {
      const tok = e.target.closest('.tok');
      if (tok) {
        const i = Number(tok.dataset.i);
        if (i === openIndex) close(); else open(tok, i);
      } else if (!e.target.closest('.word-pop')) {
        close();
      }
    });
    const onOutside = (e) => {
      if (!card.isConnected) { document.removeEventListener('click', onOutside); document.removeEventListener('keydown', onEsc); return; }
      if (!card.contains(e.target)) close();
    };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('resize', close, { once: true });
  }

  function showHistory() {
    const list = getTranslations();
    history.innerHTML = list.length ? `
      <div class="sec-head"><h2 class="sec-title">최근 번역</h2></div>
      <section class="card-list">
        ${list.map((t, i) => `<button class="rc-row hist" type="button" data-i="${i}">
          <span class="rc-main"><span class="ko">${esc(t.ko)}</span><span class="jp" lang="ja">${esc(t.ja)}</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </button>`).join('')}
      </section>` : '';
    history.querySelectorAll('.hist').forEach((btn) => btn.addEventListener('click', async () => {
      const t = list[Number(btn.dataset.i)];
      src.value = t.ko;
      len.textContent = `${t.ko.length} / ${MAX}`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await showResult(t.ko, t.ja);
    }));
  }

  showHistory();
}
