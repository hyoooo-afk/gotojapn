// 앱 입구: 화면 전환(#/home, #/learn/카테고리, #/lesson/주제id ...)과 홈·학습·복습·나 화면
import { icons } from './icons.js';
import { loadTopicList, esc } from './content.js';
import {
  getSettings, setSetting, topicProgress, lastTopicId, streak, totalStudyDays, lastWeek,
  reviewDueCount, today, attemptStats, isStepDone, STEPS, STEP_MIN,
} from './storage.js';
import { toRuby } from './content.js';
import { renderLesson, TOGGLES, RATES } from './lesson.js';
import { renderReview } from './review.js';
import { renderTranslate } from './translate.js';
import { stop } from './speech.js';

const TABS = [['home', '홈'], ['learn', '학습'], ['translate', '번역'], ['review', '복습'], ['me', '나']];
const CATS = {
  '일상': { glyph: '日', color: '#0066e0' },
  '여행': { glyph: '旅', color: '#1f9d55' },
  '일·학교': { glyph: '職', color: '#be4e04' },
  '애니·드라마': { glyph: '劇', color: '#d6336c' },
};

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const darkMQ = matchMedia('(prefers-color-scheme: dark)');

tabbar.innerHTML = TABS.map(([id, label]) =>
  `<a class="tab" href="#/${id}" data-tab="${id}">${icons[id]}<span>${label}</span></a>`).join('');

// ===== 공통 부품 =====
const pct = (x) => Math.round(x * 100);

function ring(value, size = 44, stroke = 4, showText = true) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="진도 ${pct(value)}%">
    <circle class="ring-track" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="ring-fill" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - value)}" transform="rotate(-90 ${mid} ${mid})"/>
    ${showText ? `<text class="ring-text" x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${pct(value)}%</text>` : ''}
  </svg>`;
}

function topicRow(t) {
  const p = topicProgress(t.id);
  const color = CATS[t.category]?.color || '#0066e0';
  return `<a class="topic-row" href="#/lesson/${esc(t.id)}">
    <span class="g" lang="ja" style="--c:${color}">${esc(t.sample)}</span>
    <span class="info">
      <span class="t">${esc(t.title)}</span>
      <span class="d">${esc(t.desc)}</span>
      <span><span class="tier">${esc(t.level)}</span> <span class="meta">· 약 ${t.minutes}분</span></span>
    </span>
    ${p >= 1 ? `<span class="done" aria-label="완료">${icons.check}</span>` : ring(p)}
  </a>`;
}

const emptyTile = (glyph, title, hint, href, label) => `
  <div class="empty"><div class="g" lang="ja">${glyph}</div>
    <p class="t">${title}</p><p class="h">${hint}</p>
    <a class="btn-outline" href="${href}">${label}</a></div>`;

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '좋은 저녁이에요';
}

// ===== 오늘의 추천 학습 =====
const STEP_INFO = {
  view: { label: '대화문 보기', icon: 'learn', color: '#0066e0' },
  shadow: { label: '따라 말하기', icon: 'mic', color: '#7a5af8' },
  roleplay: { label: '역할극', icon: 'chat', color: '#d6336c' },
  quiz: { label: '말하기 퀴즈', icon: 'quiz', color: '#be4e04' },
  wrap: { label: '결과 정리', icon: 'check', color: '#1f9d55' },
};
const GOALS = [5, 15, 30];
const stepHref = (topicId, step) => `#/lesson/${encodeURIComponent(topicId)}${step === 'view' ? '' : `/${step}`}`;
const fmtMin = (m) => `${Math.round(m)}분`;

/** 오늘 한 일(체크) + 목표 시간을 채울 다음 할 일 */
function buildPlan(topics, goal) {
  const log = today();
  const titleOf = Object.fromEntries(topics.map((t) => [t.id, t.title]));
  const done = log.steps.map((id) => {
    const [topicId, step] = id.split('|');
    return { done: true, step, title: `${titleOf[topicId] || topicId} · ${STEP_INFO[step]?.label || step}`, min: STEP_MIN[step] };
  });
  if (log.reviews) done.unshift({ done: true, step: 'review', title: `복습 카드 ${log.reviews}장`, min: log.reviews * 0.5 });

  let left = Math.max(0, goal - log.minutes);
  const todo = [];
  const due = reviewDueCount();
  if (due) {
    const min = Math.max(1, Math.ceil(due * 0.5));
    todo.push({ step: 'review', title: `복습 카드 ${due}장`, min, href: '#/review/session' });
    left -= min;
  }
  const last = lastTopicId();
  const order = [...topics].sort((a, b) => (b.id === last) - (a.id === last));
  for (const t of order) {
    for (const step of STEPS) {
      if (todo.length && left <= 0) break;
      if (isStepDone(t.id, step)) continue;
      todo.push({ step, title: `${t.title} · ${STEP_INFO[step].label}`, min: STEP_MIN[step], href: stepHref(t.id, step) });
      left -= STEP_MIN[step];
    }
  }
  return { log, done, todo };
}

function planRow(item) {
  const info = item.step === 'review'
    ? { icon: 'review', color: '#1f9d55' }
    : STEP_INFO[item.step];
  const inner = `
    <span class="pi" style="--c:${info.color}">${icons[info.icon]}</span>
    <span class="info"><span class="t">${esc(item.title)}</span><span class="meta">${item.done ? '완료' : `약 ${fmtMin(item.min)}`}</span></span>
    ${item.done ? `<span class="done sm" aria-label="완료">${icons.check}</span>` : '<span class="chev" aria-hidden="true">›</span>'}`;
  return item.done
    ? `<div class="plan-row done-row">${inner}</div>`
    : `<a class="plan-row" href="${item.href}">${inner}</a>`;
}

// ===== 홈 =====
async function renderHome() {
  const topics = await loadTopicList();
  const progress = topics.map((t) => topicProgress(t.id));
  const overall = progress.reduce((a, b) => a + b, 0) / topics.length;
  const days = streak();
  const goal = getSettings().goal;
  const { log, done, todo } = buildPlan(topics, goal);
  const reached = log.minutes >= goal;
  const next = todo[0];

  app.innerHTML = `
    <header class="app-head">
      <div><p class="greet">${greeting()}</p><h1 class="large-title">오늘도 한마디씩</h1></div>
      <div class="head-actions">
        <span class="streak-chip" aria-label="연속 학습 ${days}일">${icons.flame}${days}</span>
        <a class="icon-btn" href="#/me" aria-label="설정">${icons.settings}</a>
      </div>
    </header>
    <section class="hero">
      <div>
        <p class="eyebrow">오늘의 목표 ${goal}분</p>
        <p class="big">${fmtMin(log.minutes)}</p>
        <p class="sub">${reached ? '오늘 목표를 채웠어요!' : `${fmtMin(goal - log.minutes)} 남았어요${next ? ` · 다음: ${esc(next.title)}` : ''}`}</p>
      </div>
      ${ring(Math.min(1, log.minutes / goal), 84, 7, false)}
      ${next
        ? `<a class="btn-white" href="${next.href}">${icons.play}${reached ? '조금 더 하기' : log.minutes ? '이어서 학습' : '오늘 학습 시작'}</a>`
        : '<a class="btn-white" href="#/learn">모든 주제를 끝냈어요 · 목록 보기</a>'}
    </section>
    <div class="sec-head">
      <h2 class="sec-title">오늘의 추천</h2>
      <div class="seg" role="group" aria-label="하루 목표">
        ${GOALS.map((g) => `<button data-goal="${g}" class="${g === goal ? 'on' : ''}" aria-pressed="${g === goal}">${g}분</button>`).join('')}
      </div>
    </div>
    <section class="plan-list">${[...done, ...todo].map(planRow).join('')}</section>
    <section class="stats">
      <div class="stat" style="--c:#fa8c16"><span class="ico">${icons.flame}</span><span class="val">${days}일</span><span class="cap">연속 학습</span></div>
      <div class="stat" style="--c:#0066e0"><span class="ico">${icons.learn}</span><span class="val">${pct(overall)}%</span><span class="cap">전체 진도</span></div>
      <a class="stat" href="#/review" style="--c:#1f9d55"><span class="ico">${icons.review}</span><span class="val">${reviewDueCount()}</span><span class="cap">복습할 카드</span></a>
    </section>
    <div class="sec-head"><h2 class="sec-title">카테고리</h2></div>
    <section class="cat-grid">
      ${Object.entries(CATS).map(([name, c]) => `
        <a class="cat" href="#/learn/${encodeURIComponent(name)}" style="--c:${c.color}">
          <span class="g" lang="ja">${c.glyph}</span>${esc(name)}</a>`).join('')}
    </section>
    <div class="sec-head"><h2 class="sec-title">주제</h2><a class="link" href="#/learn">전체 보기 ›</a></div>
    <section class="topic-list">${topics.slice(0, 4).map(topicRow).join('')}</section>`;

  app.querySelectorAll('[data-goal]').forEach((btn) => btn.addEventListener('click', () => {
    setSetting('goal', Number(btn.dataset.goal));
    renderHome();
  }));
}

// ===== 학습 =====
async function renderLearn(cat) {
  const topics = await loadTopicList();
  const cats = ['전체', ...new Set([...Object.keys(CATS), ...topics.map((t) => t.category)])];
  const active = cats.includes(cat) ? cat : '전체';
  const list = active === '전체' ? topics : topics.filter((t) => t.category === active);

  app.innerHTML = `
    <header class="app-head"><div><p class="greet">총 ${topics.length}개 주제</p><h1 class="large-title">학습</h1></div></header>
    <nav class="chip-row" aria-label="카테고리">
      ${cats.map((c) => `<a class="chip ${c === active ? 'on' : ''}" href="#/learn${c === '전체' ? '' : `/${encodeURIComponent(c)}`}">${esc(c)}</a>`).join('')}
    </nav>
    <section class="topic-list">
      ${list.length ? list.map(topicRow).join('')
        : emptyTile(esc(CATS[active]?.glyph || '準'), '아직 주제가 없어요', '7단계에서 주제를 채워 넣을게요', '#/learn', '전체 보기')}
    </section>`;
}

// ===== 나 =====
async function renderMe() {
  const topics = await loadTopicList();
  const week = lastWeek();
  const max = Math.max(1, ...week.map((d) => d.minutes));
  const weekTotal = week.reduce((a, d) => a + d.minutes, 0);
  const stats = attemptStats();
  const s = getSettings();
  const titleOf = Object.fromEntries(topics.map((t) => [t.id, t.title]));

  app.innerHTML = `
    <header class="app-head"><div><p class="greet">내 기록</p><h1 class="large-title">나</h1></div></header>
    <section class="panel stat-row">
      <div><p class="sv">${streak()}</p><p class="sc">연속 학습일</p></div>
      <div><p class="sv">${totalStudyDays()}</p><p class="sc">공부한 날</p></div>
      <div><p class="sv">${stats.count}</p><p class="sc">말해 본 표현</p></div>
    </section>
    <div class="sec-head"><h2 class="sec-title">이번 주</h2><span class="meta">총 ${fmtMin(weekTotal)}</span></div>
    <section class="panel">
      <div class="bars">
        ${week.map((d) => `<div class="bar ${d.today ? 'today' : ''}" title="${d.label}요일 ${fmtMin(d.minutes)}">
          <em>${d.minutes ? Math.round(d.minutes) : ''}</em>
          <i class="${d.minutes ? '' : 'off'}" style="height:${d.minutes ? Math.max(12, Math.round((d.minutes / max) * 88)) : 4}px"></i>
          <span>${d.label}</span></div>`).join('')}
      </div>
    </section>
    <div class="sec-head"><h2 class="sec-title">주제별 진도</h2><a class="link" href="#/learn">학습 ›</a></div>
    <section class="topic-list">${topics.map(topicRow).join('')}</section>
    <div class="sec-head"><h2 class="sec-title">자주 틀리는 표현</h2>${stats.count ? `<span class="meta">평균 최고점 ${pct(stats.avg)}%</span>` : ''}</div>
    ${stats.weakest.length
      ? `<section class="card-list">${stats.weakest.map((a) => `
          <a class="rc-row" href="${stepHref(a.topicId, 'wrap')}">
            <span class="rc-main">
              <span class="jp" lang="ja">${toRuby(a.ja)}</span>
              <span class="ko">${esc(a.ko)}</span>
              <span class="meta">${esc(titleOf[a.topicId] || '')} · 최고 ${pct(a.best)}% · ${a.tries}번 말함</span>
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </a>`).join('')}</section>`
      : `<p class="panel meta center">${stats.count ? '자주 틀리는 표현이 없어요. 잘하고 있어요!' : '따라 말하기나 퀴즈를 하면 여기에 모여요'}</p>`}
    <div class="sec-head"><h2 class="sec-title">문장 표시 기본값</h2></div>
    <section class="list">
      ${TOGGLES.map(([k, label]) => `<div class="row">
        <label for="set-${k}">${label}</label>
        <input class="switch" type="checkbox" role="switch" id="set-${k}" data-key="${k}" ${s[k] ? 'checked' : ''}>
      </div>`).join('')}
      <div class="row"><span>읽어주기 속도</span>
        <div class="seg" role="group" aria-label="읽어주기 속도">
          ${RATES.map((r) => `<button data-rate="${r}" class="${s.rate === r ? 'on' : ''}" aria-pressed="${s.rate === r}">${r}×</button>`).join('')}
        </div>
      </div>
    </section>`;

  app.querySelectorAll('.switch').forEach((el) =>
    el.addEventListener('change', () => setSetting(el.dataset.key, el.checked)));
  app.querySelectorAll('[data-rate]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setSetting('rate', Number(btn.dataset.rate));
      app.querySelectorAll('[data-rate]').forEach((b) => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-pressed', b === btn);
      });
    }));
}

const routes = {
  home: renderHome,
  learn: renderLearn,
  translate: () => renderTranslate(app),
  review: (arg) => renderReview(app, arg),
  me: renderMe,
};

// ===== 테마와 화면 전환 =====
function applyTheme(stage) {
  document.body.classList.toggle('stage', stage);
  document.body.classList.toggle('dark', darkMQ.matches); // 학습 화면도 기기 설정을 따름 (기본 흰 배경)
  document.querySelector('meta[name="theme-color"]').content = darkMQ.matches ? '#000000' : '#f5f7fa';
}
darkMQ.addEventListener('change', () => applyTheme(document.body.classList.contains('stage')));

async function route() {
  stop();
  let name, arg, sub;
  try {
    [name, arg, sub] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  } catch { name = 'home'; }
  const isLesson = name === 'lesson';
  applyTheme(isLesson || (name === 'review' && arg === 'session')); // 학습 화면은 탭 바 숨김
  const tab = routes[name] ? name : isLesson ? 'learn' : 'home';
  tabbar.querySelectorAll('.tab').forEach((a) => {
    const active = a.dataset.tab === tab;
    a.classList.toggle('active', active);
    a.toggleAttribute('aria-current', active);
  });
  const due = reviewDueCount();
  const reviewTab = tabbar.querySelector('[data-tab="review"]');
  reviewTab.dataset.badge = due > 99 ? '99+' : due || '';
  reviewTab.setAttribute('aria-label', due ? `복습, ${due}장 남음` : '복습');
  window.scrollTo(0, 0);
  try {
    if (isLesson) await renderLesson(app, arg, sub);
    else await (routes[name] || renderHome)(arg);
  } catch (err) {
    console.error(err);
    app.innerHTML = emptyTile('！', '내용을 불러오지 못했어요',
      'index.html을 더블클릭하지 말고 로컬 서버(http://localhost:8000)로 열어주세요.', '#/home', '홈으로');
  }
}

window.addEventListener('hashchange', route);
route();

// 폰 홈 화면 앱 + 오프라인 (https 주소에서만, 내 PC 미리보기에서는 끔)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
