import test from 'node:test';
import assert from 'node:assert/strict';
import { TypewriterSound } from '../sound.js';

function contextStub(state = 'suspended') {
  const parameter = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime(value) { this.value = value; } });
  const node = () => ({ connect(target) { return target; }, disconnect() {} });
  const sources = [];
  const source = () => { const value = { ...node(), frequency: parameter(), playbackRate: parameter(), starts: [], stops: [], start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); } }; sources.push(value); return value; };
  const context = {
    state, currentTime: 1, sampleRate: 48000, destination: node(), sources,
    async resume() { this.state = 'running'; },
    createGain() { return { ...node(), gain: parameter() }; },
    createDynamicsCompressor() { return { ...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() }; },
    createBuffer(channels, size) { return { getChannelData: () => new Float32Array(size) }; },
    createBufferSource: source, createOscillator: source,
    createBiquadFilter() { return { ...node(), frequency: parameter() }; },
  };
  return context;
}

test('first sound waits for the user-gesture resume instead of disappearing while suspended', async () => {
  const context = contextStub();
  let resume;
  context.resume = () => new Promise(resolve => { resume = () => { context.state = 'running'; resolve(); }; });
  const sound = new TypewriterSound({ contextFactory: () => context });
  const unlock = sound.unlock();
  assert.equal(sound.key(), false);
  resume();
  assert.equal(await unlock, true);
  assert.equal(sound.key(), true);
  assert.equal(sound.status().scheduledCount, 1);
  assert.equal(context.sources.length, 2);
  assert.ok(context.sources.every(source => source.starts.length === 1 && source.stops.length === 1));
});

test('muting cancels sound tails and cannot be undone by an older pending unlock', async () => {
  const context = contextStub();
  let resume;
  context.resume = () => new Promise(resolve => { resume = () => { context.state = 'running'; resolve(); }; });
  const sound = new TypewriterSound({ contextFactory: () => context });
  const unlock = sound.unlock();
  sound.disable();
  resume();
  assert.equal(await unlock, false);
  assert.equal(sound.key(), false);
  assert.equal(await sound.unlock(), true);
  sound.complete();
  sound.disable();
  assert.ok(context.sources.every(source => source.stops.length === 2));
  assert.equal(sound.feed(), false);
});

test('a later interaction resumes an interrupted context; unsupported audio fails explicitly', async () => {
  const context = contextStub('running');
  const sound = new TypewriterSound({ contextFactory: () => context });
  assert.equal(await sound.unlock(), true);
  context.state = 'interrupted';
  assert.equal(sound.key(), false);
  assert.equal(await sound.unlock(), true);
  assert.equal(sound.feed(), true);
  const unsupported = new TypewriterSound({ contextFactory: () => { throw new Error('unsupported'); } });
  assert.equal(await unsupported.unlock(), false);
  assert.equal(unsupported.status().enabled, false);
});
