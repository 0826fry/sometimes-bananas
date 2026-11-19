// 가끔 바나나: random keypresses, followed by selection of the next correct letter.
// There is no learning and no change in character probabilities after feeding.
export const MAX_TARGET_LENGTH = 48;
export const KEYS_PER_SHEET = 240;
export const ENERGY_PER_KEY = 0.055;
export const DISTRACTORS = 'abcdefghijklmnopqrstuvwxyz.,!? ';
export const DRAFT_VERSION = 1;

const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ko', { granularity: 'grapheme' })
  : null;

export function splitGraphemes(value) {
  const text = String(value ?? '');
  if (segmenter) return Array.from(segmenter.segment(text), part => part.segment);
  // Older browsers: keep common accents, emoji modifiers, ZWJ emoji and flags
  // together. Target text is NFC-normalized by createDraft.
  const groups = [];
  let regionalCount = 0;
  for (const char of Array.from(text)) {
    const regional = /\p{Regional_Indicator}/u.test(char);
    const extender = /[\p{Mark}\p{Emoji_Modifier}\uFE0E\uFE0F]/u.test(char);
    const previous = groups.at(-1);
    if (previous && (extender || char === '\u200d' || previous.endsWith('\u200d') || (regional && regionalCount % 2 === 1))) {
      groups[groups.length - 1] += char;
    } else {
      groups.push(char);
    }
    regionalCount = regional ? regionalCount + 1 : 0;
  }
  return groups;
}

function normalizedTarget(target) {
  if (typeof target !== 'string') throw new TypeError('문장을 입력해 주세요.');
  const text = target.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  const letters = splitGraphemes(text);
  if (!letters.length) throw new RangeError('원숭이에게 맡길 문장을 적어 주세요.');
  if (letters.length > MAX_TARGET_LENGTH) throw new RangeError(`문장은 ${MAX_TARGET_LENGTH}자 이내로 적어 주세요.`);
  return { text, letters };
}

export function makeAlphabet(target) {
  return [...new Set([...splitGraphemes(String(target).normalize('NFC')), ...splitGraphemes(DISTRACTORS)])];
}

function cryptoUint32() {
  const sample = new Uint32Array(1);
  if (!globalThis.crypto?.getRandomValues) throw new Error('이 브라우저에서는 무작위 타이핑을 시작할 수 없습니다.');
  globalThis.crypto.getRandomValues(sample);
  return sample[0];
}

// Rejection sampling avoids modulo bias, even for alphabets of arbitrary size.
export function randomIndex(size, uint32Source = cryptoUint32) {
  if (!Number.isInteger(size) || size < 1 || size > 0x100000000) throw new RangeError('Invalid alphabet size.');
  const limit = 0x100000000 - (0x100000000 % size);
  for (;;) {
    const sample = uint32Source();
    if (!Number.isInteger(sample) || sample < 0 || sample > 0xffffffff) throw new RangeError('Random source must return an unsigned 32-bit integer.');
    if (sample < limit) return sample % size;
  }
}

function shortLabel(value, fallback, limit) {
  return splitGraphemes(String(value ?? '').trim()).slice(0, limit).join('') || fallback;
}

export function createDraft(target, { monkeyName = '몽', requester = '', energy = 100 } = {}) {
  const { text, letters } = normalizedTarget(target);
  if (!Number.isFinite(energy) || energy < 0 || energy > 100) throw new RangeError('직원의 기운을 불러오지 못했습니다.');
  return {
    version: DRAFT_VERSION,
    target: text,
    letters,
    alphabet: makeAlphabet(text),
    index: 0,
    attempts: 0,
    history: [],
    activeMs: 0,
    bananas: 0,
    energy,
    createdAt: new Date().toISOString(),
    completedAt: null,
    monkeyName: shortLabel(monkeyName, '몽', 24),
    requester: shortLabel(requester, '', 32),
  };
}

// Mutates the draft. index in the returned event is the target position tested;
// draft.index is the count of retained characters AFTER this attempt.
export function typeOne(draft, chooseIndex = randomIndex) {
  if (draft.index >= draft.letters.length || draft.energy <= 0) return null;
  const choice = chooseIndex(draft.alphabet.length);
  if (!Number.isInteger(choice) || choice < 0 || choice >= draft.alphabet.length) throw new RangeError('Invalid random key index.');
  const char = draft.alphabet[choice];
  const index = draft.index;
  const accepted = char === draft.letters[index];
  draft.history.push({ char, accepted });
  draft.attempts += 1;
  draft.energy = Math.max(0, Math.round((draft.energy - ENERGY_PER_KEY) * 1000) / 1000);
  if (accepted) draft.index += 1;
  const complete = draft.index === draft.letters.length;
  if (complete) draft.completedAt = new Date().toISOString();
  return { char, accepted, index, complete };
}

export function paperCount(draft) {
  return Math.ceil(draft.attempts / KEYS_PER_SHEET);
}

// Rebuild derived data and replay the retained prefix before trusting a save.
// Invalid or incompatible saves return null, never a half-valid draft.
export function restoreDraft(saved) {
  try {
    const value = typeof saved === 'string' ? JSON.parse(saved) : saved;
    if (!value || value.version !== DRAFT_VERSION || typeof value.target !== 'string') return null;
    const { text, letters } = normalizedTarget(value.target);
    if (text !== value.target || !Array.isArray(value.history)) return null;
    const alphabet = makeAlphabet(text);
    const allowed = new Set(alphabet);
    const history = [];
    let index = 0;
    for (const entry of value.history) {
      if (index === letters.length || !entry || !allowed.has(entry.char) || typeof entry.accepted !== 'boolean') return null;
      const accepted = entry.char === letters[index];
      if (entry.accepted !== accepted) return null;
      history.push({ char: entry.char, accepted });
      if (accepted) index += 1;
    }
    if (value.index !== index || value.attempts !== history.length) return null;
    if (!Number.isFinite(value.activeMs) || value.activeMs < 0) return null;
    if (!Number.isSafeInteger(value.bananas) || value.bananas < 0) return null;
    if (!Number.isFinite(value.energy) || value.energy < 0 || value.energy > 100) return null;
    if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) return null;
    const complete = index === letters.length;
    if (complete && (typeof value.completedAt !== 'string' || !Number.isFinite(Date.parse(value.completedAt)))) return null;
    if (!complete && value.completedAt !== null) return null;
    return {
      version: DRAFT_VERSION, target: text, letters, alphabet, index,
      attempts: history.length, history, activeMs: value.activeMs,
      bananas: value.bananas, energy: value.energy,
      createdAt: value.createdAt, completedAt: value.completedAt,
      monkeyName: shortLabel(value.monkeyName, '몽', 24),
      requester: shortLabel(value.requester, '', 32),
    };
  } catch {
    return null;
  }
}
