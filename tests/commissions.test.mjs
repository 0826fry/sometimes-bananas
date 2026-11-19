import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, splitGraphemes, typeOne } from '../engine.js';
import { COMMISSION_SAMPLES, createCommission, remainingText, splitNext, undoLastSplit, nextPending, activeChunk, claimNext, completeChunk, releaseChunk, chunkForDraft, restoreCommission } from '../commissions.js';

const commission = manuscript => createCommission({ title: '시험 의뢰', client: '의뢰인', manuscript });
const finish = draft => { while (!draft.completedAt) typeOne(draft, () => draft.alphabet.indexOf(draft.letters[draft.index])); return draft; };

test('commission samples are original long manuscripts with fictional notices', () => {
  assert.equal(COMMISSION_SAMPLES.length, 3);
  for (const sample of COMMISSION_SAMPLES) {
    assert.match(sample.note, /가상의 외주/);
    assert.ok(splitGraphemes(sample.manuscript).length >= 160);
    assert.ok(splitGraphemes(sample.manuscript).length <= 280);
    assert.ok(restoreCommission(createCommission(sample)));
  }
});

test('splits use grapheme boundaries and preserve source whitespace exactly', () => {
  const c = commission('  e\u0301한👨‍👩‍👧‍👦\r\n다음 줄  ');
  assert.equal(c.manuscript, '  é한👨‍👩‍👧‍👦\n다음 줄  ');
  const first = splitNext(c, 5);
  assert.equal(first.target, 'é한👨‍👩‍👧‍👦');
  assert.equal(remainingText(c), '\n다음 줄  ');
  const last = splitNext(c, 5);
  assert.equal(last.target, '다음 줄');
  assert.equal(remainingText(c), '');
  assert.equal(c.chunks.map(x => x.source).join(''), c.manuscript);
  assert.equal(c.cursor, splitGraphemes(c.manuscript).length);
  assert.deepEqual(restoreCommission(JSON.stringify(c)), c);
});

test('split length limits constrain actual work, and empty-only pieces are refused', () => {
  assert.throws(() => commission(' '));
  assert.throws(() => commission('가'.repeat(4001)));
  const c = commission('한'.repeat(49));
  assert.throws(() => splitNext(c, 49));
  assert.throws(() => splitNext(c, 0));
  assert.throws(() => splitNext(c, 1.5));
  assert.throws(() => splitNext(c, 50));
  assert.equal(c.chunks.length, 0);
  splitNext(c, 48);
  splitNext(c, 1);
  assert.equal(remainingText(c), '');
  const spaces = commission('  가나다');
  assert.throws(() => splitNext(spaces, 2));
  assert.equal(spaces.cursor, 0);
});

test('undo only removes the last still-pending split without changing source', () => {
  const c = commission('가나다라마바사');
  splitNext(c, 2);
  splitNext(c, 2);
  assert.equal(undoLastSplit(c), true);
  assert.equal(remainingText(c), '다라마바사');
  const d = createDraft(nextPending(c).target);
  claimNext(c, d);
  assert.equal(undoLastSplit(c), false);
  assert.equal(activeChunk(c).target, '가나');
  assert.equal(remainingText(c), '다라마바사');
});

test('assignment links survive reload and completion is idempotent', () => {
  const c = commission('안녕 반가워');
  splitNext(c, 3);
  splitNext(c, 3);
  const d = createDraft(nextPending(c).target);
  const chunk = claimNext(c, d);
  assert.equal(claimNext(c, d), chunk);
  assert.equal(chunkForDraft(c, d), chunk);
  assert.deepEqual(restoreCommission(c), c);
  assert.equal(completeChunk(c, d), false);
  assert.throws(() => claimNext(c, createDraft('반가워')));
  const wrongDraft = finish(createDraft('안녕'));
  wrongDraft.createdAt = '2020-01-01T00:00:00.000Z';
  assert.equal(completeChunk(c, wrongDraft), false);
  finish(d);
  d.activeMs = 1200;
  assert.equal(completeChunk(c, d), true);
  assert.equal(completeChunk(c, d), false);
  assert.equal(activeChunk(c), null);
  assert.equal(nextPending(c).target, '반가워');
  assert.equal(chunk.summary.activeMs, 1200);
  assert.equal(chunk.summary.attempts, 2);
  assert.deepEqual(restoreCommission(JSON.stringify(c)), c);
});

test('abandoned assignment returns to queue without losing the manuscript', () => {
  const c = commission('일을 나눠요');
  splitNext(c, 2);
  const d = createDraft('일을');
  const chunk = claimNext(c, d);
  assert.equal(releaseChunk(c, { ...d, createdAt: '2020-01-01T00:00:00.000Z' }), false);
  assert.equal(releaseChunk(c, chunk.id), true);
  assert.equal(chunk.status, 'pending');
  assert.equal(chunk.draftLink, null);
  assert.equal(chunk.summary, null);
  assert.equal(c.chunks.map(x => x.source).join('') + remainingText(c), c.manuscript);
});

test('restore rejects gaps, invented targets, invalid statuses and malformed progress', () => {
  const c = commission('하나 둘 셋');
  splitNext(c, 3);
  splitNext(c, 2);
  claimNext(c, createDraft('하나'));
  const mutate = fn => { const copy = structuredClone(c); fn(copy); assert.equal(restoreCommission(copy), null); };
  mutate(x => { x.cursor++; });
  mutate(x => { x.chunks[1].start++; });
  mutate(x => { x.chunks[0].target = '없던 글자'; });
  mutate(x => { x.chunks[1].status = 'completed'; });
  mutate(x => { x.chunks[0].draftLink.target = '다른 글'; });
  mutate(x => { x.chunks[0].status = 'completed'; x.chunks[0].summary = { attempts: 1, activeMs: 0, bananas: 0, completedAt: new Date().toISOString() }; });
  mutate(x => { x.createdAt = 'oops'; });
  mutate(x => { x.id = '<script>'; });
  assert.equal(restoreCommission('{broken json'), null);
});
