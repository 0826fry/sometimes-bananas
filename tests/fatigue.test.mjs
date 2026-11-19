import test from 'node:test';
import assert from 'node:assert/strict';
import { fatigueProfile } from '../fatigue.js';

test('less energy progressively slumps the employee and slows both hands', () => {
  let previous = fatigueProfile(100);
  for (const energy of [80, 64, 50, 34, 20, 14, 0]) {
    const next = fatigueProfile(energy);
    assert.ok(next.headTilt > previous.headTilt);
    assert.ok(next.bodyTilt > previous.bodyTilt);
    assert.ok(next.handLeftPeriod > previous.handLeftPeriod);
    assert.ok(next.handRightPeriod > previous.handRightPeriod);
    assert.ok(next.eyeOpen < previous.eyeOpen);
    previous = next;
  }
  assert.equal(fatigueProfile(65).tier, 'fresh');
  assert.equal(fatigueProfile(35).tier, 'tired');
  assert.equal(fatigueProfile(15).tier, 'weary');
  assert.equal(fatigueProfile(0).tier, 'exhausted');
});

test('presentation bounds tiredness and rejects nonfinite poses', () => {
  assert.deepEqual(fatigueProfile(200), fatigueProfile(100));
  assert.deepEqual(fatigueProfile(-10), fatigueProfile(0));
  assert.deepEqual(fatigueProfile(NaN), fatigueProfile(100));
  assert.deepEqual(fatigueProfile(Infinity), fatigueProfile(100));
});
