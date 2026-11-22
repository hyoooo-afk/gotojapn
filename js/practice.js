// 레슨 화면 ② 따라 말하기, ③ 역할극
import { toRuby, toKana, esc } from './content.js';
import { speak, stop, listen, stopListening, srSupported } from './speech.js';
import { recordAttempt } from './storage.js';
import { grade, verdict } from './compare.js';
import { icons } from './icons.js';

const pct = (x) => Math.round(x * 100);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== 공통: 대답 입력 (마이크 + 타이핑) =====
const MIC_ERRORS = {
  'not-allowed': '마이크가 막혀 있어요. 주소창 왼쪽 아이콘에서 마이크를 허용해 주세요',
  'service-not-allowed': '마이크가 막혀 있어요. 주소창 왼쪽 아이콘에서 마이크를 허용해 주세요',
  'no-speech': '아무 말도 듣지 못했어요. 다시 눌러 주세요',
  'audio-capture': '마이크를 찾을 수 없어요. 연결을 확인해 주세요',
  network: '음성 인식은 인터넷 연결이 필요해요',
};

export function answerBox(onAnswer) {
  const el = document.createElement('div');
  el.className = 'answer';
  el.innerHTML = `
    ${srSupported
      ? `<button class="mic" type="button" aria-label="눌러서 말하기">${icons.mic}</button>
         <p class="mic-hint">눌러서 말하기</p>
         <p class="interim" lang="ja" aria-live="polite"></p>`
      : '<p class="mic-hint">이 브라우저는 음성 인식을 지원하지 않아요. 타이핑으로 입력해 주세요 (Chrome·Edge 권장)</p>'}
    <form class="type-row">
      <input class="text-input" lang="ja" placeholder="일본어로 입력" autocomplete="off" aria-label="일본어로 입력">
      <button class="btn-dark" type="submit">확인</button>
    </form>`;

  const mic = el.querySelector('.mic');
  const hint = el.querySelector('.mic-hint');
  const interim = el.querySelector('.interim');
  let listening = false;

  mic?.addEventListener('click', async () => {
    if (listening) { stopListening(); return; }
    listening = true;
    mic.classList.add('listening');
    hint.textContent = '듣고 있어요… 말이 끝나면 자동으로 멈춰요';
    interim.textContent = '';
    try {
      const { text, alternatives } = await listen({ onInterim: (t) => { interim.textContent = t; } });
      if (!el.isConnected) return;
      if (text) {
        hint.textContent = '다시 말하려면 눌러 주세요';
        onAnswer([text, ...alternatives]);
      } else {
        hint.textContent = MIC_ERRORS['no-speech'];
      }
    } catch (err) {
      hint.textContent = MIC_ERRORS[err] || '음성 인식에 실패했어요. 타이핑으로 입력해 보세요';
    } finally {
      listening = false;
      mic.classList.remove('listening');
    }
  });

  el.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.currentTarget.querySelector('input');
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    onAnswer([value]);
  });
  return el;
}

/** 화면 아래에 잠깐 뜨는 알림 */
export function toast(message) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

const diffHTML = (diff) => diff.map((d) => (d.ok ? esc(d.ch) : `<mark>${esc(d.ch)}</mark>`)).join('');

/** 짧은 교정: 점수 + 내 말 + 정답(틀린 글자 표시) */
export function feedbackHTML(r) {
  const v = verdict(r.score);
  return `<div class="feedback ${v.ok ? 'good' : 'bad'}" role="status">
    <div class="fb-head">
      <span class="fb-icon">${v.ok ? icons.check : icons.close}</span>${v.label}
      <span class="fb-score">${pct(r.score)}%</span>
    </div>
    <p class="fb-row"><span class="fb-k">내 말</span><span lang="ja">${esc(r.heard) || '—'}</span></p>
    <p class="fb-row"><span class="fb-k">정답</span><span lang="ja" class="diff">${diffHTML(r.diff)}</span></p>
  </div>`;
}

/** 끝나고 자세히: 평균 점수 + 다시 연습할 문장 */
export function summaryHTML(title, results, lines) {
  const answered = results.filter(Boolean);
  const avg = answered.length ? answered.reduce((a, r) => a + r.score, 0) / answered.length : 0;
  const weak = lines
    .map((l, i) => ({ l, r: results[i] }))
    .filter(({ r }) => r === null || (r && r.score < 0.7));
  return `<div class="summary">
    <p class="tier">${title}</p>
    <p class="big">${pct(avg)}<span class="unit">점</span></p>
    <p class="desc">평균 일치율 · ${answered.length}문장 대답</p>
    ${weak.length
      ? `<p class="sum-title">다시 연습할 문장</p>
         <ul class="sum-list">${weak.map(({ l, r }) => `<li>
           <span class="jp" lang="ja">${toRuby(l.ja)}</span>
           <span class="ko">${esc(l.ko)}</span>
           <span class="meta">${r ? `${pct(r.score)}%` : '건너뜀'}</span></li>`).join('')}</ul>
         <p class="meta">정리 탭에서 복습 카드에 담을 수 있어요</p>`
      : '<p class="desc">모든 문장을 잘 말했어요!</p>'}
  </div>`;
}

export const pairCta = (primaryHref, primaryLabel) =>
  `<div class="cta-pair"><button class="btn-ghost-lg" id="again">다시 하기</button>
   <a class="btn-primary" href="${primaryHref}">${primaryLabel}</a></div>`;

// ===== ② 따라 말하기 =====
export function renderShadow(stage, ctx) {
  const { topic, settings, names } = ctx;
  const lines = topic.dialogue;
  const best = new Array(lines.length).fill(null);
  let i = 0;

  function show() {
    if (!stage.isConnected) return;
    if (i >= lines.length) return finish();
    const l = lines[i];
    const last = i === lines.length - 1;
    ctx.setProgress(i, lines.length);

    stage.innerHTML = `
      <p class="rp-intro">문장을 듣고 똑같이 따라 말해 보세요.</p>
      <div class="practice-card">
        <div class="pc-top">
          <span class="speaker">${esc(names[l.speaker] || l.speaker)} · ${i + 1} / ${lines.length}</span>
          <button class="icon-btn" id="hear" aria-label="다시 듣기">${icons.speaker}</button>
        </div>
        <p class="jp big" lang="ja">${toRuby(l.ja)}</p>
        ${l.pron ? `<p class="pron">${esc(l.pron)}</p>` : ''}
        ${l.ko ? `<p class="ko">${esc(l.ko)}</p>` : ''}
      </div>
      <div id="fb"></div>`;

    const fb = stage.querySelector('#fb');
    const next = ctx.setCta(`<button class="btn-primary" id="next">건너뛰기</button>`).querySelector('#next');
    const hear = () => speak(toKana(l.ja), settings.rate);

    stage.insertBefore(answerBox((texts) => {
      const r = grade(l.ja, texts);
      recordAttempt(ctx.id, l.ja, l.ko, r.score);
      if (!best[i] || r.score > best[i].score) best[i] = r;
      fb.innerHTML = feedbackHTML(r);
      next.textContent = last ? '결과 보기' : '다음 문장';
      fb.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }), fb);

    stage.querySelector('#hear').addEventListener('click', hear);
    next.addEventListener('click', () => { stop(); i++; window.scrollTo(0, 0); show(); });
    hear();
  }

  function finish() {
    ctx.complete('shadow');
    ctx.setProgress(lines.length, lines.length);
    stage.innerHTML = summaryHTML('따라 말하기 완료', best, lines);
    ctx.setCta(pairCta(`#/lesson/${encodeURIComponent(ctx.id)}/roleplay`, '역할극 하기'))
      .querySelector('#again').addEventListener('click', () => { window.scrollTo(0, 0); renderShadow(stage, ctx); });
  }

  show();
}

// ===== ③ 역할극 =====
export function renderRoleplay(stage, ctx) {
  const { topic, settings, names, me } = ctx;
  const lines = topic.dialogue;
  const myTurns = lines.filter((l) => l.speaker === me).length;
  const results = []; // 내 대사 칸에만 결과 (건너뛰면 null)
  let i = 0;
  let answered = 0;

  stage.innerHTML = `
    <p class="rp-intro">나는 <b>${esc(names[me] || me)}</b> 역할이에요. 상대의 말을 듣고, 한국어 뜻을 보고 일본어로 대답해 보세요.</p>
    <ol class="chat" id="chat"></ol>
    <div id="turn"></div>`;
  const chat = stage.querySelector('#chat');
  const turn = stage.querySelector('#turn');
  ctx.setProgress(0, myTurns);
  ctx.setCta(`<button class="btn-primary" id="start">${icons.play}역할극 시작</button>`)
    .querySelector('#start').addEventListener('click', step);

  function addMsg(html, who) {
    const li = document.createElement('li');
    li.className = `msg ${who}`;
    li.innerHTML = html;
    chat.append(li);
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const myName = esc(names[me] || me);

  async function step() {
    if (!stage.isConnected) return;
    if (i >= lines.length) return finish();
    const l = lines[i];

    // 상대 차례: 읽어주고 다음으로
    if (l.speaker !== me) {
      ctx.setCta('<button class="btn-primary" disabled>상대가 말하는 중…</button>');
      addMsg(`<p class="speaker">${esc(names[l.speaker] || l.speaker)}</p>
        <p class="jp" lang="ja">${toRuby(l.ja)}</p>
        ${l.ko ? `<p class="ko">${esc(l.ko)}</p>` : ''}`, 'them');
      await speak(toKana(l.ja), settings.rate);
      if (!stage.isConnected) return;
      await wait(250);
      i++;
      return step();
    }

    // 내 차례
    turn.innerHTML = `<div class="turn-card">
      <p class="tier">내 차례 · 일본어로 말해 보세요</p>
      <p class="ko-big">${esc(l.ko)}</p>
      <button class="ghost" id="hint" type="button">힌트 보기</button>
      <div class="hint" hidden>
        <p class="jp" lang="ja">${toRuby(l.ja)}</p>
        ${l.pron ? `<p class="pron">${esc(l.pron)}</p>` : ''}
      </div>
    </div>`;
    const hintBtn = turn.querySelector('#hint');
    hintBtn.addEventListener('click', () => {
      const box = turn.querySelector('.hint');
      box.hidden = !box.hidden;
      hintBtn.textContent = box.hidden ? '힌트 보기' : '힌트 숨기기';
    });

    const done = (r) => {
      results[i] = r;
      answered++;
      turn.innerHTML = '';
      ctx.setProgress(answered, myTurns);
      i++;
      step();
    };

    turn.append(answerBox((texts) => {
      const r = grade(l.ja, texts);
      recordAttempt(ctx.id, l.ja, l.ko, r.score);
      const v = verdict(r.score);
      addMsg(`<p class="speaker">${myName} <span class="badge ${v.ok ? 'good' : 'bad'}">${v.ok ? '✓' : '✕'} ${pct(r.score)}%</span></p>
        <p class="jp" lang="ja">${esc(r.heard)}</p>
        ${r.score < 0.9 ? `<p class="model"><span class="fb-k">정답</span> <span lang="ja">${toRuby(l.ja)}</span></p>` : ''}`, 'me');
      done(r);
    }));
    turn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    ctx.setCta('<button class="btn-primary" id="skip">건너뛰기</button>')
      .querySelector('#skip').addEventListener('click', () => {
        stop();
        addMsg(`<p class="speaker">${myName} <span class="badge bad">건너뜀</span></p>
          <p class="jp" lang="ja">${toRuby(l.ja)}</p>`, 'me');
        done(null);
      });
  }

  function finish() {
    ctx.complete('roleplay');
    turn.innerHTML = summaryHTML('역할극 완료', results, lines);
    turn.scrollIntoView({ block: 'start', behavior: 'smooth' });
    ctx.setCta(pairCta(`#/lesson/${encodeURIComponent(ctx.id)}/quiz`, '퀴즈 풀기'))
      .querySelector('#again').addEventListener('click', () => { window.scrollTo(0, 0); renderRoleplay(stage, ctx); });
  }
}
