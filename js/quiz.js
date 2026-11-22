// 레슨 화면 ④ 말하기 퀴즈 (한국어 → 일본어), ⑤ 결과 정리
import { toRuby, toKana, esc } from './content.js';
import { speak, stop } from './speech.js';
import {
  isStepDone, recordAttempt, getAttempts, inReview, addReview, removeReview,
} from './storage.js';
import { grade } from './compare.js';
import { answerBox, feedbackHTML, summaryHTML, pairCta, toast } from './practice.js';
import { icons } from './icons.js';

const pct = (x) => Math.round(x * 100);
const WEAK = 0.7;

// ===== ④ 말하기 퀴즈 =====
export function renderQuiz(stage, ctx) {
  const { topic, settings } = ctx;
  const items = (topic.quiz?.length ? topic.quiz : topic.dialogue).map(({ ja, ko }) => ({ ja, ko }));
  const best = new Array(items.length).fill(null);
  let i = 0;

  function show() {
    if (!stage.isConnected) return;
    if (i >= items.length) return finish();
    const q = items[i];
    const last = i === items.length - 1;
    const kana = toKana(q.ja);
    let hintLevel = 0;
    ctx.setProgress(i, items.length);

    stage.innerHTML = `
      <p class="rp-intro">한국어 문장을 보고 일본어로 말해 보세요.</p>
      <div class="practice-card">
        <p class="speaker">문제 ${i + 1} / ${items.length}</p>
        <p class="ko-big">${esc(q.ko)}</p>
        <div class="hint-row">
          <button class="ghost" id="hint" type="button">힌트</button>
          <span class="hint-text" lang="ja"></span>
        </div>
      </div>
      <div id="fb"></div>`;

    const fb = stage.querySelector('#fb');
    const hintBtn = stage.querySelector('#hint');
    const hintText = stage.querySelector('.hint-text');
    const next = ctx.setCta('<button class="btn-primary" id="next">건너뛰기</button>').querySelector('#next');

    // 힌트 1: 앞 두 글자 → 힌트 2: 전체 읽는 법
    hintBtn.addEventListener('click', () => {
      hintLevel++;
      hintText.textContent = hintLevel === 1 ? `${[...kana].slice(0, 2).join('')}…` : kana;
      if (hintLevel === 1) hintBtn.textContent = '힌트 더 보기';
      else hintBtn.hidden = true;
    });

    stage.insertBefore(answerBox((texts) => {
      const r = grade(q.ja, texts);
      recordAttempt(ctx.id, q.ja, q.ko, r.score);
      if (!best[i] || r.score > best[i].score) best[i] = r;
      fb.innerHTML = `${feedbackHTML(r)}
        <div class="answer-reveal">
          <span class="jp" lang="ja">${toRuby(q.ja)}</span>
          <button class="icon-btn" id="say" aria-label="정답 듣기">${icons.speaker}</button>
        </div>`;
      fb.querySelector('#say').addEventListener('click', () => speak(kana, settings.rate));
      speak(kana, settings.rate);
      next.textContent = last ? '결과 보기' : '다음 문제';
      fb.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }), fb);

    next.addEventListener('click', () => { stop(); i++; window.scrollTo(0, 0); show(); });
  }

  function finish() {
    ctx.complete('quiz');
    ctx.setProgress(items.length, items.length);
    stage.innerHTML = summaryHTML('말하기 퀴즈 완료', best, items);
    ctx.setCta(pairCta(`#/lesson/${encodeURIComponent(ctx.id)}/wrap`, '결과 정리 보기'))
      .querySelector('#again').addEventListener('click', () => { window.scrollTo(0, 0); renderQuiz(stage, ctx); });
  }

  show();
}

// ===== ⑤ 결과 정리 =====
export function renderWrap(stage, ctx) {
  const { settings } = ctx;
  const all = getAttempts(ctx.id);

  if (!all.length) {
    ctx.setProgress(0, 0);
    stage.innerHTML = `<div class="summary">
      <p class="tier">결과 정리</p>
      <p class="desc">아직 이 주제를 말해 본 기록이 없어요.<br>따라 말하기, 역할극, 퀴즈를 하면 여기에 모여요.</p>
    </div>`;
    ctx.setCta(`<a class="btn-primary" href="#/lesson/${encodeURIComponent(ctx.id)}/shadow">따라 말하기 시작</a>`);
    return;
  }

  const weak = all.filter((a) => a.best < WEAK || a.last < WEAK).sort((a, b) => a.best - b.best);
  const good = all.filter((a) => !weak.includes(a)).sort((a, b) => b.best - a.best);
  const avg = all.reduce((s, a) => s + a.best, 0) / all.length;
  ctx.setProgress(good.length, all.length);

  const item = (a) => {
    const on = inReview(a.key);
    return `<li class="wrap-item" data-key="${esc(a.key)}">
      <div class="wi-main">
        <span class="jp" lang="ja">${toRuby(a.ja)}</span>
        <span class="ko">${esc(a.ko)}</span>
        <span class="meta">최고 ${pct(a.best)}% · 최근 ${pct(a.last)}% · ${a.tries}번 말함</span>
      </div>
      <div class="wi-actions">
        <button class="icon-btn" data-say aria-label="듣기">${icons.speaker}</button>
        <button class="icon-btn add ${on ? 'on' : ''}" data-add aria-pressed="${on}"
          aria-label="${on ? '복습 카드에서 빼기' : '복습 카드에 담기'}">${on ? icons.check : icons.plus}</button>
      </div>
    </li>`;
  };

  stage.innerHTML = `
    <section class="summary stat-row wrap-stats">
      <div><p class="sv">${all.length}</p><p class="sc">말해 본 표현</p></div>
      <div><p class="sv">${pct(avg)}<small>%</small></p><p class="sc">평균 최고점</p></div>
      <div><p class="sv">${weak.length}</p><p class="sc">약한 표현</p></div>
    </section>
    ${weak.length ? `<h2 class="sum-title">다시 연습할 표현</h2><ul class="wrap-list">${weak.map(item).join('')}</ul>` : ''}
    ${good.length ? `<h2 class="sum-title">잘한 표현</h2><ul class="wrap-list">${good.map(item).join('')}</ul>` : ''}
    <p class="meta wrap-note">＋를 누르면 복습 카드에 담겨요. 점수 ${pct(WEAK)}% 미만이면 약한 표현이에요.</p>`;

  const byKey = Object.fromEntries(all.map((a) => [a.key, a]));
  stage.querySelectorAll('.wrap-item').forEach((li) => {
    const a = byKey[li.dataset.key];
    li.querySelector('[data-say]').addEventListener('click', () => speak(toKana(a.ja), settings.rate));
    const add = li.querySelector('[data-add]');
    add.addEventListener('click', () => {
      const on = !inReview(a.key);
      if (on) addReview(a.key, a); else removeReview(a.key);
      add.classList.toggle('on', on);
      add.setAttribute('aria-pressed', on);
      add.setAttribute('aria-label', on ? '복습 카드에서 빼기' : '복습 카드에 담기');
      add.innerHTML = on ? icons.check : icons.plus;
      toast(on ? '복습 카드에 담았어요' : '복습 카드에서 뺐어요');
      updateCta();
    });
  });

  function updateCta() {
    const pending = weak.filter((a) => !inReview(a.key));
    if (pending.length) {
      ctx.setCta(`<button class="btn-primary" id="addAll">${icons.plus}약한 표현 ${pending.length}개 복습 카드에 담기</button>`)
        .querySelector('#addAll').addEventListener('click', () => {
          pending.forEach((a) => addReview(a.key, a));
          ctx.complete('wrap');
          toast(`${pending.length}개를 복습 카드에 담았어요`);
          renderWrap(stage, ctx);
        });
    } else {
      if (!isStepDone(ctx.id, 'wrap')) ctx.complete('wrap');
      ctx.setCta('<a class="btn-primary" href="#/home">정리 완료 · 홈으로</a>');
    }
  }
  updateCta();
}
