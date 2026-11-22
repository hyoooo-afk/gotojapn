// 복습 탭: 오늘 복습할 카드 + 모든 카드 목록, 그리고 카드 넘기기 복습 (#/review/session)
import { loadTopicList, toRuby, toKana, esc } from './content.js';
import { speak } from './speech.js';
import {
  getSettings, getReviewCards, dueCards, gradeCard, schedule, removeReview, whenLabel,
} from './storage.js';
import { grade as gradeAnswer } from './compare.js';
import { answerBox, feedbackHTML, toast } from './practice.js';
import { icons } from './icons.js';

const GRADES = [['again', '다시'], ['hard', '어려움'], ['good', '좋음'], ['easy', '쉬움']];

export async function renderReview(app, arg) {
  if (arg === 'session') return renderSession(app);
  return renderOverview(app);
}

async function topicTitles() {
  const topics = await loadTopicList();
  return { translate: '번역', ...Object.fromEntries(topics.map((t) => [t.id, t.title])) };
}

// ===== 복습 탭 첫 화면 =====
async function renderOverview(app) {
  const cards = getReviewCards().sort((a, b) => a.due - b.due);
  const head = `<header class="app-head"><div><p class="greet">잊기 전에 다시 보기</p><h1 class="large-title">복습</h1></div></header>`;

  if (!cards.length) {
    app.innerHTML = `${head}
      <div class="empty"><div class="g" lang="ja">復</div>
        <p class="t">복습할 카드가 없어요</p>
        <p class="h">레슨의 정리 탭에서 약한 표현을 담을 수 있어요</p>
        <a class="btn-outline" href="#/learn">학습하러 가기</a></div>`;
    return;
  }

  const titles = await topicTitles();
  const due = dueCards();
  const nextDue = cards.find((c) => c.due > Date.now())?.due;

  app.innerHTML = `${head}
    <section class="hero">
      <div>
        <p class="eyebrow">오늘 복습</p>
        <p class="big">${due.length}<span class="unit">장</span></p>
        <p class="sub">${due.length ? '지금 복습하면 오래 기억해요' : `다음 복습: ${whenLabel(nextDue)}`}</p>
      </div>
      <span class="hero-glyph" lang="ja" aria-hidden="true">復</span>
      ${due.length
        ? `<a class="btn-white" href="#/review/session">${icons.play}복습 시작</a>`
        : '<a class="btn-white" href="#/learn">새 주제 학습하기</a>'}
    </section>
    <div class="sec-head"><h2 class="sec-title">모든 카드 ${cards.length}</h2></div>
    <section class="card-list">
      ${cards.map((c) => `<div class="rc-row" data-key="${esc(c.key)}">
        <div class="rc-main">
          <span class="jp" lang="ja">${toRuby(c.ja)}</span>
          <span class="ko">${esc(c.ko)}</span>
          <span class="meta">${esc(titles[c.topicId] || '')} · ${c.due <= Date.now()
            ? '<b class="due-now">지금 복습</b>' : `다음 복습 ${whenLabel(c.due)}`}</span>
        </div>
        <button class="icon-btn" data-remove aria-label="카드 빼기">${icons.close}</button>
      </div>`).join('')}
    </section>`;

  app.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeReview(btn.closest('.rc-row').dataset.key);
      toast('복습 카드에서 뺐어요');
      renderOverview(app);
    });
  });
}

// ===== 카드 넘기기 복습 =====
async function renderSession(app) {
  const settings = getSettings();
  const titles = await topicTitles();
  const queue = dueCards().map((c) => c.key);
  const total = queue.length;
  let done = 0;
  let again = 0;

  if (!total) { location.hash = '#/review'; return; }

  app.innerHTML = `
    <div class="study-top">
      <a class="icon-btn" href="#/review" aria-label="닫기">${icons.close}</a>
      <div class="progress" aria-hidden="true"><div class="progress-fill" id="prog"></div></div>
      <span class="counter" id="count"></span>
    </div>
    <div id="stage"></div>
    <div class="cta-wrap" id="cta"></div>`;
  const stage = app.querySelector('#stage');
  const cta = app.querySelector('#cta');
  stage.classList.toggle('hide-furigana', !settings.furigana);

  // PC 단축키: 스페이스 = 정답 보기, 1~4 = 다시/어려움/좋음/쉬움
  const onKey = (e) => {
    if (!stage.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.target instanceof Element && e.target.closest('input, textarea, button, a')) return;
    if (e.key === ' ') { const b = cta.querySelector('#flip'); if (b) { e.preventDefault(); b.click(); } }
    const g = GRADES[Number(e.key) - 1];
    if (g) cta.querySelector(`[data-grade="${g[0]}"]`)?.click();
  };
  document.addEventListener('keydown', onKey);

  function setProgress() {
    app.querySelector('#prog').style.width = `${(done / total) * 100}%`;
    app.querySelector('#count').textContent = `${done} / ${total}`;
  }

  function show() {
    if (!stage.isConnected) return;
    setProgress();
    if (!queue.length) return finish();
    const key = queue[0];
    const c = getReviewCards().find((x) => x.key === key);
    if (!c) { queue.shift(); return show(); }
    const say = () => speak(toKana(c.ja), settings.rate);

    stage.innerHTML = `
      <div class="flashcard" id="card">
        <div class="fc-inner">
          <div class="fc-face fc-front">
            <p class="tier">${esc(titles[c.topicId] || '')}</p>
            <p class="fc-ko">${esc(c.ko)}</p>
            <p class="meta">뜻을 보고 일본어로 말해 보세요</p>
          </div>
          <div class="fc-face fc-back" aria-hidden="true">
            <p class="fc-ko-sm">${esc(c.ko)}</p>
            <p class="fc-jp" lang="ja">${toRuby(c.ja)}</p>
            <button class="icon-btn" id="say" aria-label="듣기" tabindex="-1">${icons.speaker}</button>
          </div>
        </div>
      </div>
      <div id="fb"></div>`;

    const card = stage.querySelector('#card');
    const fb = stage.querySelector('#fb');
    const box = answerBox((texts) => {
      fb.innerHTML = feedbackHTML(gradeAnswer(c.ja, texts));
      flip();
    });
    stage.insertBefore(box, fb);
    stage.querySelector('#say').addEventListener('click', say);
    cta.innerHTML = '<button class="btn-primary" id="flip">정답 보기</button>';
    cta.querySelector('#flip').addEventListener('click', flip);

    function flip() {
      card.classList.add('flipped');
      card.querySelector('.fc-front').setAttribute('aria-hidden', 'true');
      const back = card.querySelector('.fc-back');
      back.removeAttribute('aria-hidden');
      back.querySelector('#say').removeAttribute('tabindex');
      box.remove();
      say();

      cta.innerHTML = `<div class="grade-row">
        ${GRADES.map(([g, label]) => {
          const next = schedule(c, g);
          return `<button class="grade ${g === 'good' ? 'primary' : ''}" data-grade="${g}">
            <span>${label}</span><small>${g === 'again' ? '1분 후' : whenLabel(next.due)}</small></button>`;
        }).join('')}
      </div>`;
      cta.querySelectorAll('[data-grade]').forEach((btn) => btn.addEventListener('click', () => {
        const g = btn.dataset.grade;
        gradeCard(key, g);
        queue.shift();
        if (g === 'again') { queue.push(key); again++; } else done++;
        window.scrollTo(0, 0);
        show();
      }));
    }
  }

  function finish() {
    document.removeEventListener('keydown', onKey);
    stage.innerHTML = `<div class="summary">
      <p class="tier">복습 완료</p>
      <p class="big">${total}<span class="unit">장</span></p>
      <p class="desc">오늘 카드를 모두 복습했어요${again ? ` · 다시 본 횟수 ${again}번` : ''}</p>
    </div>`;
    cta.innerHTML = '<a class="btn-primary" href="#/home">홈으로</a>';
  }

  show();
}
