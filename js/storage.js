// 학습 기록과 설정을 이 기기의 브라우저에 저장해요.
const KEY = 'jp-app-v1';

const DEFAULT_SETTINGS = {
  furigana: true, // 후리가나
  pron: true,     // 한글 발음
  ko: true,       // 한국어 번역
  note: true,     // 문법·단어 설명
  rate: 0.9,      // 읽어주기 속도
  goal: 15,       // 하루 목표 (분)
};

/** 레슨 활동 5개. 주제 진도 = 끝낸 활동 / 5 */
export const STEPS = ['view', 'shadow', 'roleplay', 'quiz', 'wrap'];
/** 활동별 예상 시간(분) — 오늘의 목표 계산용 */
export const STEP_MIN = { view: 2, shadow: 3, roleplay: 3, quiz: 2, wrap: 1 };
const REVIEW_MIN = 0.5; // 복습 카드 한 장

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 저장 불가 시 무시 */ }
}
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ===== 설정 =====
export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read().settings };
}
export function setSetting(key, value) {
  const data = read();
  data.settings = { ...data.settings, [key]: value };
  write(data);
}

// ===== 주제 진도 =====
export function topicProgress(topicId) {
  const p = read().progress?.[topicId];
  if (!p) return 0;
  const done = STEPS.filter((s) => p.steps?.[s] || (s === 'view' && p.seen)).length;
  return done / STEPS.length;
}
export function completeStep(topicId, step) {
  const data = read();
  data.progress ??= {};
  const p = (data.progress[topicId] ??= {});
  p.steps = { ...p.steps, [step]: true };
  p.lastAt = Date.now();
  touchDay(data);
  logToday(data, { topicId, step });
  write(data);
}

/** 오늘 한 일과 예상 학습 시간 기록 (같은 활동을 하루에 여러 번 해도 한 번만 셈) */
function logToday(data, { topicId, step } = {}) {
  data.log ??= {};
  const day = (data.log[dayKey(new Date())] ??= { minutes: 0, steps: [], reviews: 0 });
  if (step) {
    const id = `${topicId}|${step}`;
    if (day.steps.includes(id)) return;
    day.steps.push(id);
    day.minutes += STEP_MIN[step] || 1;
  } else {
    day.reviews++;
    day.minutes += REVIEW_MIN;
  }
}

/** 오늘 기록: { minutes, steps: ['주제id|활동'], reviews } */
export function today() {
  return read().log?.[dayKey(new Date())] || { minutes: 0, steps: [], reviews: 0 };
}

/** 말하기 기록 요약 + 자주 틀리는 표현 */
export function attemptStats() {
  const all = Object.values(read().attempts || {});
  return {
    count: all.length,
    avg: all.length ? all.reduce((s, a) => s + a.best, 0) / all.length : 0,
    weakest: all.filter((a) => a.best < 0.9).sort((a, b) => a.best - b.best || b.tries - a.tries).slice(0, 5),
  };
}

/** 오늘 공부했다고 기록 (연속 기록·이번 주 그래프용) */
function touchDay(data) {
  data.days ??= {};
  const today = dayKey(new Date());
  data.days[today] = (data.days[today] || 0) + 1;
}
export function isStepDone(topicId, step) {
  const p = read().progress?.[topicId];
  return Boolean(p?.steps?.[step] || (step === 'view' && p?.seen));
}

/** 말하기 시도 기록 (4단계 복습 카드에서 점수가 낮은 문장을 꺼내 써요) */
export function recordAttempt(topicId, ja, ko, score) {
  const data = read();
  data.attempts ??= {};
  const a = (data.attempts[`${topicId}|${ja}`] ??= { topicId, ja, ko, tries: 0, best: 0 });
  a.tries++;
  a.last = score;
  a.best = Math.max(a.best, score);
  a.lastAt = Date.now();
  write(data);
}

export function getAttempts(topicId) {
  return Object.entries(read().attempts || {})
    .filter(([, a]) => a.topicId === topicId)
    .map(([key, a]) => ({ key, ...a }));
}

// ===== 최근 번역 (최대 10개) =====
export function getTranslations() {
  return read().translations || [];
}
export function saveTranslation(ko, ja) {
  const data = read();
  data.translations = [{ ko, ja, at: Date.now() }, ...(data.translations || []).filter((t) => t.ko !== ko)].slice(0, 10);
  write(data);
}

// ===== 복습 카드 (4단계에서 간격 반복 복습에 사용) =====
export function inReview(key) {
  return Boolean(read().review?.[key]);
}
export function addReview(key, { topicId, ja, ko }) {
  const data = read();
  data.review ??= {};
  data.review[key] ??= { topicId, ja, ko, addedAt: Date.now(), due: Date.now(), interval: 0 };
  write(data);
}
export function removeReview(key) {
  const data = read();
  if (data.review) delete data.review[key];
  write(data);
}
export function getReviewCards() {
  return Object.entries(read().review || {}).map(([key, c]) => ({ key, ...c }));
}
export function dueCards() {
  const now = Date.now();
  return getReviewCards().filter((c) => c.due <= now).sort((a, b) => a.due - b.due);
}
export function reviewDueCount() {
  return dueCards().length;
}

// 간격 반복: 잘 기억할수록 다음 복습까지 간격이 길어져요.
const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** 카드에 '다시/어려움/좋음/쉬움'을 고르면 바뀔 값 */
export function schedule(card, grade) {
  const ease = card.ease ?? 2.5;
  const reps = card.reps ?? 0;
  const interval = card.interval ?? 0;
  if (grade === 'again') {
    return { ease: Math.max(1.3, ease - 0.2), reps: 0, interval: 0, lapses: (card.lapses || 0) + 1, due: Date.now() + 60 * 1000 };
  }
  let days;
  let nextEase = ease;
  if (grade === 'hard') {
    days = Math.max(1, Math.round(interval * 1.2));
    nextEase = Math.max(1.3, ease - 0.15);
  } else if (grade === 'good') {
    days = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
  } else {
    days = reps === 0 ? 4 : Math.max(interval + 2, Math.round(Math.max(interval, 1) * ease * 1.3));
    nextEase = ease + 0.15;
  }
  return { ease: nextEase, reps: reps + 1, interval: days, due: startOfToday() + days * DAY };
}

export function gradeCard(key, grade) {
  const data = read();
  const card = data.review?.[key];
  if (!card) return;
  Object.assign(card, schedule(card, grade), { lastReviewed: Date.now() });
  touchDay(data);
  logToday(data);
  write(data);
}

/** 다음 복습 시점을 사람이 읽기 쉬운 말로 */
export function whenLabel(due) {
  if (due <= Date.now()) return '지금';
  const days = Math.round((due - startOfToday()) / DAY);
  if (days <= 0) return '곧';
  if (days === 1) return '내일';
  if (days < 30) return `${days}일 후`;
  return `${Math.round(days / 30)}달 후`;
}

export function lastTopicId() {
  const entries = Object.entries(read().progress || {});
  entries.sort((a, b) => (b[1].lastAt || 0) - (a[1].lastAt || 0));
  return entries[0]?.[0] || null;
}

// ===== 학습한 날 =====
export function streak() {
  const days = read().days || {};
  const d = new Date();
  if (!days[dayKey(d)]) d.setDate(d.getDate() - 1); // 오늘 아직 안 했으면 어제부터 셈
  let n = 0;
  while (days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function totalStudyDays() {
  return Object.keys(read().days || {}).length;
}
/** 최근 7일 (오래된 날 → 오늘) */
export function lastWeek() {
  const data = read();
  const days = data.days || {};
  const log = data.log || {};
  const names = ['일', '월', '화', '수', '목', '금', '토'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const k = dayKey(d);
    return { label: names[d.getDay()], count: days[k] || 0, minutes: log[k]?.minutes || 0, today: i === 6 };
  });
}
