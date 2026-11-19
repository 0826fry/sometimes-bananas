// A little portrait of the employee after work. The drawing records real effort
// and bananas, rather than adding an arbitrary badge to every receipt.
export function receiptArtState(draft = {}) {
  const attempts = Math.max(0, Math.floor(Number(draft.attempts) || 0));
  const bananas = Math.max(0, Math.floor(Number(draft.bananas) || 0));
  return {
    attempts,
    bananas,
    tiredLevel: attempts >= 800 ? 2 : attempts >= 250 ? 1 : 0,
    shownPeels: Math.min(6, bananas),
  };
}

export function receiptArtCaption(draft) {
  const { bananas, tiredLevel } = receiptArtState(draft);
  if (!bananas) return '시키는 대로 눌렀다. 바나나는 어디 있지.';
  if (tiredLevel === 2) return '뭘 쓴 건지는 모르겠다. 손은 좀 아프다.';
  if (tiredLevel === 1) return '두드렸더니 바나나가 나왔다. 내일도 눌러봐야지.';
  return '종이는 모르겠고, 바나나는 맛있었다.';
}

function safePaint(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function bananaPeel(x, y, rotation, paper, scale = 1) {
  return `<g class="receipt-banana-peel" transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">
    <path d="M0-3c-8 1-14 8-19 8C-13 11-4 8 1 2c1 8 7 13 14 12-4-5-8-10-9-16 6 4 12 5 17 1-8-1-12-5-17-7L4-15l-5 1 1 11Z" fill="${paper}"/>
    <path d="M1-9 3-3m-3 1c-6 5-11 7-15 8M3-1c1 6 5 10 8 12m-7-13c6 4 10 5 14 4" stroke-width=".8"/>
  </g>`;
}

export function createReceiptArt(draft, { ink = '#20201e', paper = '#fcfbf8' } = {}) {
  const state = receiptArtState(draft);
  ink = safePaint(ink, '#20201e');
  paper = safePaint(paper, '#fcfbf8');
  const tilt = [3, 10, 18][state.tiredLevel];
  const drop = [0, 3, 8][state.tiredLevel];
  const eyelids = state.tiredLevel === 0
    ? '<path d="M159 105h6c0 3-1 5-3 5s-3-2-3-5Zm26 3h6c0 3-1 5-3 5s-3-2-3-5Z" stroke="none" fill="' + ink + '"/>'
    : '<path d="m158 108 7 1m19 2 7 1" stroke-width="1.6"/>';
  const positions = [[251,172,-13,1],[287,179,22,.86],[225,185,-36,.81],[314,167,-8,.91],[270,187,43,.82],[303,188,-25,.76]];
  const peels = positions.slice(0, state.shownPeels).map(([x,y,r,s]) => bananaPeel(x,y,r,paper,s)).join('');
  const floorEnd = state.bananas ? 343 : 321;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="200" viewBox="0 0 420 200" fill="none" role="img" aria-label="작업을 마친 원숭이 직원과 먹은 바나나 껍질 ${state.bananas}개">
  <g stroke="${ink}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M83 178H${floorEnd}" stroke-width=".7" opacity=".24"/>
    <g transform="translate(67 -17) scale(.72)">
      <path d="M147 234C111 257 53 257 45 227c-7-26 15-43 31-32 13 10 7 26-4 26-6 0-9-5-8-9" stroke-width="2.1"/>
      <path d="M148 146c-24 9-35 32-35 57 0 24 16 38 43 38h42c11 0 14-12 4-17l-21-10c10-26 9-51-9-66" stroke-width="2.1"/>
      <path d="M130 190c-5 19 3 34 21 34h25m-41 17-8 6m25-6-4 6m39-20 5 8m-4-4 6 5"/>
      <path d="M154 151c-11 19-13 31-7 45 6 14 22 21 43 21l26-1M167 148c-4 22 1 39 17 45l33 7" stroke-width="2.1"/>
      <path d="M180 147c9 2 17 17 22 25l24 17m-47-30c7 8 12 18 19 23l23 14" stroke-width="1.8"/>
      <g class="receipt-monkey-head" transform="translate(0 ${drop}) rotate(${tilt} 173 147)" fill="${paper}" stroke-width="2.1">
        <path d="M135 104c-8-2-17 0-17 12 0 11 8 16 18 12m1-18c-6-5-12-1-12 5 0 6 4 9 9 7"/>
        <path d="M136 104c-2-18 8-34 28-38l-3-8 10 6 6-8 3 10c20 1 32 16 34 34 1 9-2 17-8 22 2 15-5 28-19 33-14 5-30 2-40-9-11-12-14-27-11-42Z"/>
        <path d="M149 105c1-12 9-20 19-17 6 2 9 6 10 10 5-4 11-5 17-2 8 4 10 13 6 22" stroke-width="1.5" fill="none"/>
        <path d="M151 122c-1 10 6 20 21 23 17 4 30-3 31-14 1-9-9-17-24-19-14-3-26 1-28 10Z"/>
        ${eyelids}
        <path d="m166 125 2 1m13 0 2 1m-15 10c7-1 13-1 18 0" stroke-width="1.5"/>
        <path d="m140 92-3 5m61-17 4 5" stroke-width="1.2"/>
      </g>
      <g stroke-width="1.8" fill="${paper}">
        <path d="M243 168v-59h66v59"/>
        <path d="M251 120h27m-27 7h39m-39 7h31m-31 7h8m8 0h21" stroke-width="1.1" opacity=".5"/>
        <path d="M231 162h90v12h-90zM225 163h6v10h-6zm96 0h7v10h-7zm-4-1v-11h15"/>
        <path d="M236 175h78l18 44H215l21-44ZM215 219h117v13H215zm8 13v5h10v-5m81 0v5h10v-5"/>
        <path d="M239 183h71m-76 8h80m-85 9h89m-79 10h65" stroke-width="1.3"/>
        <path d="M244 179v7m12-7v7m12-7v7m12-7v7m12-7v7m12-7v7m-65 1v8m13-8v8m13-8v8m13-8v8m13-8v8m13-8v8m-69 1v7m14-7v7m14-7v7m14-7v7m14-7v7m14-7v7" stroke-width=".8"/>
        <path d="m218 186 14 1c7 0 12 2 15 6 1 2 0 4-3 3l-10-3 13 7c3 2 2 5-1 4l-13-5 9 6c3 2 1 5-2 3l-13-7-7-4"/>
        <path d="m210 200 16 1c6 0 10 3 12 6 2 3 0 5-3 3l-10-4 13 8c3 2 2 5-1 4l-13-6 9 7c2 2 0 4-3 2l-15-8-7-1"/>
      </g>
    </g>
    ${peels}
  </g>
  </svg>`;
}
