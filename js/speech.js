// 듣기(읽어주기)와 말하기(음성 인식) — 브라우저 내장 기능이라 무료
export const ttsSupported = 'speechSynthesis' in window;

// ===== 읽어주기 =====
let voice = null;
function pickVoice() {
  const ja = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').startsWith('ja'));
  // 자연스러운 목소리를 먼저 고름
  voice = ja.find((v) => /Natural|Online|Google|Nanami|Kyoko|O-ren/i.test(v.name)) || ja[0] || null;
}
if (ttsSupported) {
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice);
}

/** 문장을 읽고, 다 읽으면 끝나는 Promise */
export function speak(text, rate = 0.9) {
  return new Promise((resolve) => {
    if (!ttsSupported) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (voice) u.voice = voice;
    u.rate = rate;
    // 브라우저가 끝 신호를 안 보내는 경우를 대비한 안전장치
    const guard = setTimeout(resolve, 2000 + (text.length * 350) / rate);
    u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
    speechSynthesis.speak(u);
  });
}

export function stop() {
  if (ttsSupported) speechSynthesis.cancel();
  stopListening();
}

// ===== 음성 인식 (Chrome·Edge·Safari) =====
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const srSupported = Boolean(Recognition);
let current = null;

/**
 * 마이크로 일본어를 듣고 문장 후보를 돌려줘요.
 * 실패하면 에러 코드('not-allowed', 'no-speech', 'network' ...)로 reject 돼요.
 */
export function listen({ onInterim } = {}) {
  return new Promise((resolve, reject) => {
    if (!Recognition) return reject('unsupported');
    if (ttsSupported) speechSynthesis.cancel();
    const r = new Recognition();
    r.lang = 'ja-JP';
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.continuous = false;
    let text = '';
    let alternatives = [];
    let error = null;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          text += res[0].transcript;
          alternatives = [...res].slice(1).map((a) => a.transcript);
        } else {
          interim += res[0].transcript;
        }
      }
      onInterim?.(text + interim);
    };
    r.onerror = (e) => { error = e.error; };
    r.onend = () => {
      if (current === r) current = null;
      if (error && error !== 'aborted') reject(error);
      else resolve({ text, alternatives });
    };
    current = r;
    r.start();
  });
}

export function stopListening() {
  current?.stop();
}
