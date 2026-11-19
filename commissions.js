import { splitGraphemes, restoreDraft, MAX_TARGET_LENGTH } from './engine.js';

export const MAX_MANUSCRIPT_LENGTH = 4000;
export const COMMISSION_SAMPLES = [
  {
    id: 'closing-bookshop',
    title: '마지막 날, 문에 붙일 글',
    client: '오래된 책방',
    note: '가상의 외주 의뢰입니다. 문을 닫는 책방의 마지막 안내문을 부탁받았습니다.',
    manuscript: '이 책방은 이번 달을 끝으로 문을 닫습니다.\n책을 사러 오셨다가 비만 피하고 가신 분도, 한 권을 고르느라 오후를 다 쓰신 분도 고맙습니다. 책 사이에 두고 간 영수증과 쪽지는 아직 카운터 서랍에 있습니다. 찾으실 분은 마지막 날까지 들러주세요.\n문은 닫지만, 여기서 가져간 책은 각자의 방에서 계속 펼쳐지겠지요. 그 정도면 꽤 오래 문을 열어둔 셈이라고 생각합니다. 마지막 날에도 늘 하던 시간에 문을 열겠습니다.',
  },
  {
    id: 'band-first-show',
    title: '첫 공연을 앞두고',
    client: '이름을 못 정한 밴드',
    note: '가상의 외주 의뢰입니다. 동네 밴드가 공연장 입구에 놓을 짧은 편지를 보내왔습니다.',
    manuscript: '오늘은 저희의 첫 공연입니다.\n합주실에서는 꽤 괜찮았는데, 사람들 앞에서도 그럴지는 아직 모르겠습니다. 박자를 놓치면 서로 눈을 마주칠 테고, 가사를 잊으면 조금 더 크게 기타를 칠지도 모릅니다. 그럴 때는 새로 만든 부분인가 보다 하고 들어주시면 감사하겠습니다.\n끝나고 어떤 노래가 좋았는지 알려주세요. 하나도 기억나지 않으면 그냥 소리가 컸다고 해주셔도 됩니다. 와주신 것만으로도 다음 합주를 잡을 이유가 생겼습니다.',
  },
  {
    id: 'lost-left-sock',
    title: '오른쪽 양말의 공개 편지',
    client: '서랍 속 오른쪽 양말',
    note: '가상의 외주 의뢰입니다. 의뢰인은 왼쪽 양말을 찾고 있습니다. 실종 신고인지는 불분명합니다.',
    manuscript: '왼쪽에게.\n네가 마지막으로 목격된 곳은 세탁기 앞이었다. 나는 건조대를 거쳐 다시 서랍에 왔는데, 너는 아직 소식이 없다. 다른 양말과 짝을 이루라는 권유도 받았지만, 줄무늬가 다르면 금방 들킬 것 같아 기다리는 중이다.\n혹시 침대 밑에 있다면 먼지는 털지 않아도 괜찮으니 돌아와라. 구멍이 났어도 상관없다. 우리가 앞으로 몇 번이나 더 산책할 수 있을지는 모르지만, 적어도 다음 빨래까지는 여기서 기다리겠다.',
  },
];

function normalizedSource(value) {
  if (typeof value !== 'string') throw new TypeError('의뢰 원고를 입력해주세요.');
  const text = value.normalize('NFC').replace(/\r\n?/g, '\n');
  if (!text.trim()) throw new RangeError('의뢰 원고가 비어 있습니다.');
  if (splitGraphemes(text).length > MAX_MANUSCRIPT_LENGTH) throw new RangeError(`원고는 ${MAX_MANUSCRIPT_LENGTH.toLocaleString('ko-KR')}자까지 받을 수 있습니다.`);
  return text;
}

function label(value, fallback, limit) {
  return splitGraphemes(String(value ?? '').normalize('NFC').trim()).slice(0, limit).join('') || fallback;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `commission-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createCommission(sample) {
  if (!sample || typeof sample !== 'object') throw new TypeError('의뢰서를 선택해주세요.');
  return {
    version: 1,
    id: newId(),
    title: label(sample.title, '이름 없는 의뢰', 80),
    client: label(sample.client, '익명의 의뢰인', 80),
    note: label(sample.note, '', 400),
    manuscript: normalizedSource(sample.manuscript),
    cursor: 0,
    chunks: [],
    createdAt: new Date().toISOString(),
  };
}

export function remainingText(commission) {
  return splitGraphemes(commission.manuscript).slice(commission.cursor).join('');
}

export function nextPending(commission) {
  return commission.chunks.find(chunk => chunk.status === 'pending') ?? null;
}

export function activeChunk(commission) {
  return commission.chunks.find(chunk => chunk.status === 'assigned') ?? null;
}

// A split boundary counts graphemes in the remaining source. Keep source spacing
// separately: engine targets trim their outer whitespace, but the final assembled
// manuscript must reproduce the original paragraphs and spaces exactly.
export function splitNext(commission, count) {
  const letters = splitGraphemes(commission.manuscript);
  if (!Number.isSafeInteger(count) || count < 1 || count > letters.length - commission.cursor) throw new RangeError('나눌 위치를 다시 골라주세요.');
  let end = commission.cursor + count;
  // Attach a whitespace-only tail to this final piece instead of creating a job
  // which createDraft cannot type. Its target still has at most 48 graphemes.
  if (!letters.slice(end).join('').trim()) end = letters.length;
  const source = letters.slice(commission.cursor, end).join('');
  const target = source.trim();
  if (!target) throw new RangeError('빈칸만 따로 맡길 수는 없습니다. 글자가 있는 곳까지 선택해주세요.');
  if (splitGraphemes(target).length > MAX_TARGET_LENGTH) throw new RangeError(`한 번에 ${MAX_TARGET_LENGTH}자까지 맡길 수 있습니다.`);
  const chunk = {
    id: `${commission.id}:${commission.chunks.length + 1}`,
    start: commission.cursor,
    end,
    source,
    target,
    status: 'pending',
    draftLink: null,
    summary: null,
  };
  commission.chunks.push(chunk);
  commission.cursor = end;
  return chunk;
}

export function undoLastSplit(commission) {
  const chunk = commission.chunks.at(-1);
  if (!chunk || chunk.status !== 'pending') return false;
  commission.chunks.pop();
  commission.cursor = chunk.start;
  return true;
}

export function chunkForDraft(commission, draft) {
  if (!commission || !draft) return null;
  return commission.chunks.find(chunk => chunk.draftLink?.createdAt === draft.createdAt && chunk.draftLink?.target === draft.target) ?? null;
}

export function claimNext(commission, draft) {
  const checked = restoreDraft(draft);
  if (!checked) throw new TypeError('맡길 원고를 다시 준비해주세요.');
  const existing = chunkForDraft(commission, checked);
  if (existing?.status === 'assigned') return existing;
  if (existing) throw new Error('이미 끝낸 원고입니다. 새 원고로 맡겨주세요.');
  if (activeChunk(commission)) throw new Error('직원이 맡은 원고를 먼저 마쳐주세요.');
  const chunk = nextPending(commission);
  if (!chunk) throw new Error('먼저 원고를 나눠주세요.');
  if (chunk.target !== checked.target || checked.attempts !== 0 || checked.completedAt) throw new Error('다음 차례의 원고와 일치하지 않습니다.');
  chunk.status = 'assigned';
  chunk.draftLink = { createdAt: checked.createdAt, target: checked.target };
  return chunk;
}

// Returns true only for a new completion. Replaying completion after a reload is
// harmless, and a different same-text draft cannot complete an assigned chunk.
export function completeChunk(commission, draft) {
  const chunk = chunkForDraft(commission, draft);
  if (!chunk || chunk.status !== 'assigned') return false;
  const checked = restoreDraft(draft);
  if (!checked?.completedAt) return false;
  chunk.status = 'completed';
  chunk.summary = {
    attempts: checked.attempts,
    activeMs: checked.activeMs,
    bananas: checked.bananas,
    completedAt: checked.completedAt,
  };
  return true;
}

export function releaseChunk(commission, draftOrChunkId) {
  const chunk = typeof draftOrChunkId === 'string'
    ? commission.chunks.find(item => item.id === draftOrChunkId)
    : chunkForDraft(commission, draftOrChunkId);
  if (!chunk || chunk.status !== 'assigned') return false;
  chunk.status = 'pending';
  chunk.draftLink = null;
  chunk.summary = null;
  return true;
}

const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nonnegative = value => Number.isFinite(value) && value >= 0;
const whole = value => Number.isSafeInteger(value) && value >= 0;

// Restore by reconstructing every source span and validating the state ordering.
// A malformed save never silently discards or invents a completed portion.
export function restoreCommission(saved) {
  try {
    const value = typeof saved === 'string' ? JSON.parse(saved) : saved;
    if (!value || value.version !== 1 || typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(value.id)) return null;
    if (!validDate(value.createdAt) || !whole(value.cursor) || !Array.isArray(value.chunks)) return null;
    const manuscript = normalizedSource(value.manuscript);
    if (manuscript !== value.manuscript) return null;
    for (const [key, limit] of [['title', 80], ['client', 80], ['note', 400]]) {
      if (typeof value[key] !== 'string' || value[key] !== label(value[key], '', limit) || (key !== 'note' && !value[key])) return null;
    }
    const letters = splitGraphemes(manuscript);
    if (value.cursor > letters.length || value.chunks.length > letters.length) return null;
    let cursor = 0;
    let phase = 0; // completed, at most one assigned, pending
    const links = new Set();
    const chunks = [];
    for (const [index, chunk] of value.chunks.entries()) {
      if (!chunk || chunk.id !== `${value.id}:${index + 1}` || chunk.start !== cursor || !whole(chunk.end) || chunk.end <= cursor || chunk.end > letters.length) return null;
      const source = letters.slice(cursor, chunk.end).join('');
      const target = source.trim();
      if (chunk.source !== source || chunk.target !== target || !target || splitGraphemes(target).length > MAX_TARGET_LENGTH) return null;
      if (!['completed', 'assigned', 'pending'].includes(chunk.status)) return null;
      if (chunk.status === 'completed' && phase !== 0) return null;
      if (chunk.status === 'assigned') { if (phase !== 0) return null; phase = 1; }
      if (chunk.status === 'pending') phase = 2;
      let draftLink = null;
      let summary = null;
      if (chunk.status === 'pending') {
        if (chunk.draftLink !== null || chunk.summary !== null) return null;
      } else {
        if (!chunk.draftLink || !validDate(chunk.draftLink.createdAt) || chunk.draftLink.target !== target) return null;
        const linkKey = JSON.stringify([chunk.draftLink.createdAt, target]);
        if (links.has(linkKey)) return null;
        links.add(linkKey);
        draftLink = { createdAt: chunk.draftLink.createdAt, target };
        if (chunk.status === 'assigned' && chunk.summary !== null) return null;
        if (chunk.status === 'completed') {
          const record = chunk.summary;
          if (!record || !whole(record.attempts) || record.attempts < splitGraphemes(target).length || !nonnegative(record.activeMs) || !whole(record.bananas) || !validDate(record.completedAt)) return null;
          summary = { attempts: record.attempts, activeMs: record.activeMs, bananas: record.bananas, completedAt: record.completedAt };
        }
      }
      chunks.push({ id: chunk.id, start: cursor, end: chunk.end, source, target, status: chunk.status, draftLink, summary });
      cursor = chunk.end;
    }
    if (value.cursor !== cursor) return null;
    return { version: 1, id: value.id, title: value.title, client: value.client, note: value.note, manuscript, cursor, chunks, createdAt: value.createdAt };
  } catch { return null; }
}
