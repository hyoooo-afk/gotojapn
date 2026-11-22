// 내가 말한(입력한) 문장과 정답을 비교해서 점수와 틀린 글자를 알려줘요.
import { toPlain, toKana } from './content.js';

// 비교할 때 무시하는 문장부호와 공백 (장음 ー는 의미가 있어서 남김)
const PUNCT = /[\s。、．，,.!?！？「」『』（）()・…〜~"'“”]/g;
const base = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(PUNCT, '');
// 가타카나 → 히라가나 (글자 수는 그대로)
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return row[b.length];
}

const similarity = (a, b) => (!a && !b ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length));

/** 정답 글자마다 맞았는지 표시 (최장 공통 부분열) */
function diffMarks(display, target, heard) {
  const n = target.length, m = heard.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let a = n - 1; a >= 0; a--) {
    for (let b = m - 1; b >= 0; b--) {
      dp[a][b] = target[a] === heard[b] ? dp[a + 1][b + 1] + 1 : Math.max(dp[a + 1][b], dp[a][b + 1]);
    }
  }
  const out = [];
  let a = 0, b = 0;
  while (a < n) {
    if (b < m && target[a] === heard[b]) { out.push({ ch: display[a], ok: true }); a++; b++; }
    else if (b < m && dp[a][b + 1] >= dp[a + 1][b]) b++;
    else { out.push({ ch: display[a], ok: false }); a++; }
  }
  return out;
}

/**
 * 정답(후리가나 표기)과 들은 문장 후보들을 비교해요.
 * 한자로 쓴 정답과 읽는 법(가나) 정답 둘 다와 비교해서 더 높은 점수를 써요.
 * @returns {{score:number, heard:string, diff:{ch:string, ok:boolean}[]}}
 */
export function grade(expectedJa, heardList) {
  const targets = [toPlain(expectedJa), toKana(expectedJa)].map((s) => {
    const display = base(s);
    return { display, cmp: kataToHira(display) };
  });
  let best = null;
  for (const raw of heardList.filter(Boolean)) {
    const heard = kataToHira(base(raw));
    for (const t of targets) {
      const score = similarity(t.cmp, heard);
      if (!best || score > best.score) best = { score, raw, t, heard };
    }
  }
  if (!best) best = { score: 0, raw: '', t: targets[0], heard: '' };
  return { score: best.score, heard: best.raw, diff: diffMarks(best.t.display, best.t.cmp, best.heard) };
}

export function verdict(score) {
  if (score >= 0.9) return { ok: true, label: '완벽해요' };
  if (score >= 0.7) return { ok: true, label: '좋아요' };
  return { ok: false, label: '다시 해볼까요?' };
}
