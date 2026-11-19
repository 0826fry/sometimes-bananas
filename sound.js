// Small, locally synthesised typewriter sounds. No audio files or network request.
export class TypewriterSound {
  constructor({ contextFactory } = {}) {
    this.contextFactory = contextFactory || (() => {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) throw new Error('Web Audio is unavailable');
      return new AudioContext({ latencyHint: 'interactive' });
    });
    this.context = null;
    this.master = null;
    this.enabled = false;
    this.generation = 0;
    this.scheduledCount = 0;
    this.sources = new Set();
  }

  createGraph() {
    const context = this.context = this.contextFactory();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 3;
    compressor.attack.value = .003;
    compressor.release.value = .1;
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(compressor).connect(context.destination);
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .065), context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // Call directly from a click/tap handler, then await before the first sound.
  async unlock() {
    const generation = ++this.generation;
    this.enabled = true;
    try {
      if (!this.context || this.context.state === 'closed') this.createGraph();
      if (this.context.state !== 'running') await this.context.resume();
      if (generation !== this.generation || !this.enabled) return false;
      if (this.context.state !== 'running') { this.enabled = false; return false; }
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(.32, now + .015);
      return true;
    } catch {
      if (generation === this.generation) this.enabled = false;
      return false;
    }
  }

  disable() {
    this.enabled = false;
    this.generation++;
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + .015);
    for (const source of this.sources) {
      try { source.stop(now + .02); } catch { /* Already ended. */ }
    }
  }

  ready() { return this.enabled && this.context?.state === 'running'; }

  status() {
    return Object.freeze({ enabled: this.enabled, state: this.context?.state || 'uninitialised', scheduledCount: this.scheduledCount, activeSources: this.sources.size });
  }

  track(source, nodes, start, end) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      nodes.forEach(node => node.disconnect());
    };
    source.start(start);
    source.stop(end);
  }

  tone(frequency, time, length, level, type = 'sine', endFrequency = frequency) {
    const context = this.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + length);
    envelope.gain.setValueAtTime(.0001, time);
    envelope.gain.linearRampToValueAtTime(level, time + .003);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + length);
    oscillator.connect(envelope).connect(this.master);
    this.track(oscillator, [envelope], time, time + length + .01);
  }

  clack(time, level = .65) {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = .9 + Math.random() * .2;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 850;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(.0001, time);
    envelope.gain.linearRampToValueAtTime(level, time + .002);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + .037);
    source.connect(filter).connect(envelope).connect(this.master);
    this.track(source, [filter, envelope], time, time + .05);
  }

  key(accepted = false) {
    if (!this.ready()) return false;
    const time = this.context.currentTime + .005;
    this.clack(time);
    this.tone(190 + Math.random() * 65, time, .055, .55, 'triangle', 95);
    // Slight metal resonance on retained letters, rather than a game-like beep.
    if (accepted) this.tone(1397, time + .012, .12, .09);
    this.scheduledCount++;
    return true;
  }

  feed() {
    if (!this.ready()) return false;
    const time = this.context.currentTime + .005;
    this.clack(time, .3);
    this.clack(time + .09, .22);
    this.tone(280, time, .08, .3, 'triangle', 130);
    this.scheduledCount++;
    return true;
  }

  complete() {
    if (!this.ready()) return false;
    const time = this.context.currentTime + .045;
    this.tone(1397, time, .65, .28);
    this.tone(2794, time, .27, .065);
    this.scheduledCount++;
    return true;
  }
}
