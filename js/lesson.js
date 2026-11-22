// 레슨 화면 (검은 무대): 공통 틀 + ① 대화문 보기
// ② 따라 말하기, ③ 역할극은 practice.js
import { loadTopic, toRuby, toKana, esc } from './content.js';
import { speak, stop, ttsSupported } from './speech.js';
import { getSettings, setSetting, completeStep, isStepDone } from './storage.js';
import { icons } from './icons.js';
import { renderShadow, renderRoleplay } from './practice.js';
import { renderQuiz, renderWrap } from './quiz.js';

export const TOGGLES = [['furigana', '후리가나'], ['pron', '발음'], ['ko', '번역'], ['note', '설명']];
export const RATES = [0.7, 0.9, 1.0];
const ME = 'B'; // 학습자 역할
const MODES = [['view', '보기'], ['shadow', '따라 말하기'], ['roleplay', '역할극'], ['quiz', '퀴즈'], ['wrap', '정리']];

export async function renderLesson(root, id, mode) {
  const topic = await loadTopic(id);
  if (!topic) {
    root.innerHTML = `<div class="empty"><div class="g" lang="ja">？</div>
      <p class="t">주제를 찾을 수 없어요</p><p class="h">주소를 다시 확인해 주세요</p>
      <a class="btn-outline" href="#/learn">학습 목록으로</a></div>`;
    return;
  }
  if (!MODES.some(([m]) => m === mode)) mode = 'view';
  if (mode === 'view') completeStep(id, 'view');
  const settings = getSettings();

  root.innerHTML = `
    <div class="study-top">
      <a class="icon-btn" href="#/learn" aria-label="닫기">${icons.close}</a>
      <div class="progress" aria-hidden="true"><div class="progress-fill" id="prog"></div></div>
      <span class="counter" id="count"></span>
    </div>
    <header class="lesson-head">
      <p class="tier">${esc(topic.level)} · ${esc(topic.category)}</p>
      <h1 class="title">${esc(topic.title)}</h1>
      ${topic.desc ? `<p class="desc">${esc(topic.desc)}</p>` : ''}
    </header>
    <nav class="mode-tabs" aria-label="연습 방식">
      ${MODES.map(([m, label]) => `<a class="mode-tab ${m === mode ? 'on' : ''}" href="#/lesson/${esc(id)}${m === 'view' ? '' : `/${m}`}"
        ${m === mode ? 'aria-current="page"' : ''}>${label}${isStepDone(id, m) ? '<span class="ok" aria-label="완료">✓</span>' : ''}</a>`).join('')}
    </nav>
    <div class="ghost-row">
      ${TOGGLES.map(([k, label]) => `<button class="ghost" data-toggle="${k}" aria-pressed="${settings[k]}">${label}</button>`).join('')}
      <button class="ghost" id="rate">속도 ${settings.rate}×</button>
    </div>
    ${ttsSupported ? '' : '<p class="warn">이 브라우저는 일본어 읽어주기를 지원하지 않아요. Chrome이나 Edge를 써 주세요.</p>'}
    <div id="stage"></div>
    <div class="cta-wrap" id="cta"></div>`;

  const stage = root.querySelector('#stage');
  const cta = root.querySelector('#cta');
  const prog = root.querySelector('#prog');
  const count = root.querySelector('#count');

  // 표시 켜기/끄기
  const applyToggles = () => {
    for (const [k] of TOGGLES) stage.classList.toggle(`hide-${k}`, !settings[k]);
  };
  applyToggles();
  root.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.toggle;
      settings[k] = !settings[k];
      btn.setAttribute('aria-pressed', settings[k]);
      setSetting(k, settings[k]);
      applyToggles();
    });
  });

  // 속도 바꾸기
  root.querySelector('#rate').addEventListener('click', (e) => {
    settings.rate = RATES[(RATES.indexOf(settings.rate) + 1) % RATES.length];
    setSetting('rate', settings.rate);
    e.currentTarget.textContent = `속도 ${settings.rate}×`;
  });

  // 각 연습 화면이 쓰는 공통 도구
  const ctx = {
    id, topic, settings, me: ME,
    names: topic.speakers || {},
    setProgress(done, total) {
      prog.style.width = `${total ? (done / total) * 100 : 0}%`;
      count.textContent = `${done} / ${total}`;
    },
    /** 활동 완료 기록 + 탭에 ✓ 바로 표시 */
    complete(step) {
      completeStep(id, step);
      const tab = root.querySelector(`.mode-tab[href$="${step === 'view' ? esc(id) : `/${step}`}"]`);
      if (tab && !tab.querySelector('.ok')) tab.insertAdjacentHTML('beforeend', '<span class="ok" aria-label="완료">✓</span>');
    },
    setCta(html) {
      cta.innerHTML = html;
      return cta;
    },
  };
  ({ view: renderView, shadow: renderShadow, roleplay: renderRoleplay, quiz: renderQuiz, wrap: renderWrap })[mode](stage, ctx);
}

// ① 대화문 보기 + 듣기
function renderView(stage, ctx) {
  const { topic, settings, names } = ctx;
  const lines = topic.dialogue;
  const heard = new Set();
  let run = 0; // 재생 순번: 새 재생이 시작되면 이전 재생을 멈추는 데 사용

  stage.innerHTML = `<ol class="dialogue">
    ${lines.map((l, i) => {
      const name = names[l.speaker] || l.speaker;
      return `<li class="line ${l.speaker === ctx.me ? 'me' : ''}" data-i="${i}">
        <div class="bubble" role="button" tabindex="0" aria-label="${esc(name)}: ${esc(l.ko)} 듣기">
          <p class="speaker">${esc(name)}</p>
          <p class="jp" lang="ja">${toRuby(l.ja)}</p>
          ${l.pron ? `<p class="pron">${esc(l.pron)}</p>` : ''}
          ${l.ko ? `<p class="ko">${esc(l.ko)}</p>` : ''}
          ${l.note ? `<p class="note">${esc(l.note)}</p>` : ''}
        </div>
        <button class="icon-btn play" aria-label="듣기">${icons.speaker}</button>
      </li>`;
    }).join('')}
  </ol>`;
  ctx.setProgress(0, lines.length);
  const playAllBtn = ctx.setCta('<button class="btn-primary" id="playAll"></button>').querySelector('#playAll');
  const lineEls = [...stage.querySelectorAll('.line')];

  let playingAll = false;
  const setPlayAll = (on) => {
    playingAll = on;
    playAllBtn.innerHTML = on ? `${icons.stop}멈추기` : `${icons.play}전체 듣기`;
  };
  setPlayAll(false);

  async function playLine(i, token) {
    lineEls.forEach((el) => el.classList.remove('playing'));
    lineEls[i].classList.add('playing');
    await speak(toKana(lines[i].ja), settings.rate);
    if (token !== run || !stage.isConnected) return false; // 다른 재생이 시작됐거나 화면을 떠남
    lineEls[i].classList.remove('playing');
    heard.add(i);
    ctx.setProgress(heard.size, lines.length);
    return true;
  }

  function stopAll() {
    run++;
    stop();
    lineEls.forEach((el) => el.classList.remove('playing'));
    setPlayAll(false);
  }

  async function playAll() {
    const token = ++run;
    setPlayAll(true);
    for (let i = 0; i < lines.length; i++) {
      lineEls[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!(await playLine(i, token))) return;
      await new Promise((r) => setTimeout(r, 400));
      if (token !== run) return;
    }
    setPlayAll(false);
  }

  playAllBtn.addEventListener('click', () => (playingAll ? stopAll() : playAll()));

  lineEls.forEach((el, i) => {
    const play = () => { stopAll(); playLine(i, run); };
    el.querySelector('.play').addEventListener('click', play);
    const bubble = el.querySelector('.bubble');
    bubble.addEventListener('click', play);
    bubble.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); }
    });
  });
}
