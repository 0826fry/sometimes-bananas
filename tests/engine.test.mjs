import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft, splitGraphemes, makeAlphabet, typeOne, restoreDraft,
  randomIndex, paperCount, KEYS_PER_SHEET, ENERGY_PER_KEY,
} from '../engine.js';

test('targets count graphemes and preserve Korean, accents and emoji', () => {
  assert.deepEqual(splitGraphemes('안녕👨‍👩‍👧‍👦🇰🇷e\u0301'), ['안', '녕', '👨‍👩‍👧‍👦', '🇰🇷', 'e\u0301']);
  const draft = createDraft('  e\u0301한👨‍👩‍👧‍👦  ');
  assert.equal(draft.target, 'é한👨‍👩‍👧‍👦');
  assert.equal(draft.letters.length, 3);
  assert.throws(() => createDraft(' '));
  assert.throws(() => createDraft('한'.repeat(49)));
  assert.equal(createDraft('👨‍👩‍👧‍👦'.repeat(48)).letters.length, 48);
});

test('alphabet has each target and distractor once', () => {
  const alphabet = makeAlphabet('banana안녕안');
  assert.equal(alphabet.length, new Set(alphabet).size);
  for (const char of 'banana안녕abcdefghijklmnopqrstuvwxyz.,!? ') assert.ok(alphabet.includes(char));
});

test('random sampler rejects the uneven top tail instead of biasing a key', () => {
  const samples = [0xffffffff, 0xfffffffe];
  assert.equal(randomIndex(3, () => samples.shift()), 2);
  assert.equal(samples.length, 0);
  assert.equal(randomIndex(1, () => 0xffffffff), 0);
  assert.equal(randomIndex(0x100000000, () => 0xffffffff), 0xffffffff);
  assert.throws(() => randomIndex(0));
  assert.throws(() => randomIndex(3, () => -1));
});

test('only the next matching character advances; all failures remain', () => {
  const draft = createDraft('가가!');
  const choose = char => () => draft.alphabet.indexOf(char);
  assert.deepEqual(typeOne(draft, choose('!')), { char: '!', accepted: false, index: 0, complete: false });
  typeOne(draft, choose('가'));
  typeOne(draft, choose('a'));
  typeOne(draft, choose('가'));
  const final = typeOne(draft, choose('!'));
  assert.equal(final.complete, true);
  assert.equal(draft.index, 3);
  assert.equal(draft.attempts, 5);
  assert.equal(draft.history.length, 5);
  assert.equal(draft.history.filter(entry => entry.accepted).map(entry => entry.char).join(''), draft.target);
  assert.equal(draft.energy, 100 - 5 * ENERGY_PER_KEY);
  assert.ok(draft.completedAt);
  assert.equal(typeOne(draft, choose('a')), null);
});

test('empty energy stops attempts and restored energy does not alter alphabet', () => {
  const draft = createDraft('가');
  const alphabet = [...draft.alphabet];
  draft.energy = 0.01;
  typeOne(draft, () => draft.alphabet.indexOf('a'));
  assert.equal(draft.energy, 0);
  assert.equal(typeOne(draft), null);
  draft.energy = 45;
  draft.bananas++;
  typeOne(draft, () => draft.alphabet.indexOf('a'));
  assert.deepEqual(draft.alphabet, alphabet);
  assert.equal(draft.attempts, 2);
});

test('paper accounting is explicitly 240 keystrokes per sheet', () => {
  assert.equal(paperCount({ attempts: 0 }), 0);
  assert.equal(paperCount({ attempts: 1 }), 1);
  assert.equal(paperCount({ attempts: KEYS_PER_SHEET }), 1);
  assert.equal(paperCount({ attempts: KEYS_PER_SHEET + 1 }), 2);
});

test('the same employee carries exact energy into a fresh manuscript without carrying receipt totals', () => {
  const first = createDraft('가', {energy:17.123});
  first.bananas = 2;
  typeOne(first, () => first.alphabet.indexOf('가'));
  const next = createDraft('나', {energy:first.energy});
  assert.equal(next.energy, 17.068);
  assert.equal(next.attempts, 0);
  assert.equal(next.bananas, 0);
  assert.equal(next.activeMs, 0);
  assert.deepEqual(restoreDraft(JSON.stringify(next)), next);
  const exhausted = createDraft('쉼', {energy:0});
  assert.equal(typeOne(exhausted), null);
  exhausted.energy += 30;
  assert.ok(typeOne(exhausted, () => exhausted.alphabet.indexOf('쉼')));
  assert.throws(() => createDraft('가', {energy:NaN}));
  assert.throws(() => createDraft('가', {energy:101}));
});

test('valid save restores exactly while corruption cannot invent progress', () => {
  const draft = createDraft('안녕', { monkeyName: '몽', requester: '정현준' });
  typeOne(draft, () => draft.alphabet.indexOf('a'));
  typeOne(draft, () => draft.alphabet.indexOf('안'));
  draft.activeMs = 1234;
  assert.deepEqual(restoreDraft(JSON.stringify(draft)), draft);
  const bad = structuredClone(draft);
  bad.history[0].accepted = true;
  assert.equal(restoreDraft(bad), null);
  assert.equal(restoreDraft({ ...draft, index: 2 }), null);
  assert.equal(restoreDraft({ ...draft, attempts: 999 }), null);
  assert.equal(restoreDraft({ ...draft, activeMs: NaN }), null);
  assert.equal(restoreDraft({ ...draft, energy: 101 }), null);
  assert.equal(restoreDraft('{bad json'), null);
  typeOne(draft, () => draft.alphabet.indexOf('녕'));
  assert.deepEqual(restoreDraft(draft), draft);
  assert.equal(restoreDraft({ ...draft, completedAt: null }), null);
});
