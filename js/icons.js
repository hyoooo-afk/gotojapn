// 아이콘 (선 굵기 1.6의 단순한 SVG)
const svg = (body, fill = 'none') =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  learn: svg('<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>'),
  review: svg('<rect x="3" y="7" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>'),
  me: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  flame: svg('<path d="M12 2.5c.8 3.6 5.5 5.6 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.3 2.6-5.3.3 1.8 1.2 2.8 2.1 3.2.4-3.2-.4-5.6.8-8.4z"/>', 'currentColor'),
  translate: svg('<path d="M3 5h9M7.5 3v2M5 5c.8 3.2 3.2 5.6 6 6.6M10 5c-.8 3.3-3.1 6.2-7 7.6"/><path d="M13 21l4-9 4 9M14.4 18h5.2"/>'),
  chat: svg('<path d="M4 5h16v11H9.5L4 20z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17h.01"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="M5 12.5 10 17 19 7"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  speaker: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>'),
  play: svg('<path d="M7 5v14l12-7z"/>', 'currentColor'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>', 'currentColor'),
};
