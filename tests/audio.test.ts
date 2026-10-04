import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CUES, AUDIO_LIMITS, audioAttenuation, audioNoise, audioRandom, audioRecipe, isAudioCue } from '../src/audio-recipes.ts';
import { createGameAudio } from '../src/audio.ts';
import type { GameAudioOptions } from '../src/audio.ts';

class MockParam {
  value = 0;
  events: Array<[string, number, number]> = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value: number, time: number) { assert.ok(value > 0); this.value = value; this.events.push(['exponential', value, time]); }
  setTargetAtTime(value: number, time: number, constant: number) { assert.ok(constant > 0); this.value = value; this.events.push(['target', value, time]); }
  cancelScheduledValues(time: number) { this.events.push(['cancel', 0, time]); }
}

class MockNode {
  connections: MockNode[] = [];
  disconnected = false;
  connect(node: MockNode) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; this.disconnected = true; }
}

class MockSource extends MockNode {
  type = 'sine';
  frequency = new MockParam();
  buffer: unknown = null;
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: Array<number | undefined> = [];
  failStart = false;
  start(time: number) { if (this.failStart) throw new Error('start failed'); this.starts.push(time); }
  stop(time?: number) { this.stops.push(time); }
  finish() { this.onended?.(); }
}

class MockGain extends MockNode { gain = new MockParam(); }
class MockFilter extends MockNode { type = ''; frequency = new MockParam(); Q = new MockParam(); }
class MockCompressor extends MockNode {
  threshold = new MockParam(); knee = new MockParam(); ratio = new MockParam();
  attack = new MockParam(); release = new MockParam();
}
class MockVisibility extends EventTarget {
  hidden = false;
  change(hidden: boolean) { this.hidden = hidden; this.dispatchEvent(new Event('visibilitychange')); }
}

class MockContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  destination = new MockNode();
  nodes: MockNode[] = [];
  sources: MockSource[] = [];
  buffers: Float32Array[] = [];
  resumes = 0;
  suspends = 0;
  closes = 0;
  failResume = false;
  failSourceAt = 0;
  deferredResume: (() => void) | null = null;
  deferResume = false;
  deferredSuspend: (() => void) | null = null;
  deferSuspend = false;
  make<T extends MockNode>(node: T): T { this.nodes.push(node); return node; }
  createGain() { return this.make(new MockGain()); }
  createBiquadFilter() { return this.make(new MockFilter()); }
  createDynamicsCompressor() { return this.make(new MockCompressor()); }
  createBuffer(_channels: number, length: number, rate: number) {
    assert.equal(rate, this.sampleRate);
    const samples = new Float32Array(length); this.buffers.push(samples);
    return { getChannelData: () => samples };
  }
  makeSource() {
    const source = this.make(new MockSource()); this.sources.push(source);
    source.failStart = this.sources.length === this.failSourceAt;
    return source;
  }
  createOscillator() { return this.makeSource(); }
  createBufferSource() { return this.makeSource(); }
  resume() {
    this.resumes++;
    if (this.failResume) return Promise.reject(new Error('gesture required'));
    if (this.deferResume) return new Promise<void>(resolve => { this.deferredResume = () => { this.state = 'running'; resolve(); }; });
    this.state = 'running'; return Promise.resolve();
  }
  suspend() {
    this.suspends++;
    if (this.deferSuspend) return new Promise<void>(resolve => { this.deferredSuspend = () => { this.state = 'suspended'; resolve(); }; });
    this.state = 'suspended'; return Promise.resolve();
  }
  close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
  finishAll() { this.sources.forEach(source => source.finish()); }
}

function harness(options: GameAudioOptions = {}) {
  const context = new MockContext(), visibility = new MockVisibility(), lifecycle = new EventTarget();
  let factories = 0;
  const audio = createGameAudio({ contextFactory: () => { factories++; return context as unknown as AudioContext; },
    visibilityTarget: visibility, lifecycleTarget: lifecycle, ...options });
  return { audio, context, visibility, lifecycle, factories: () => factories };
}

test('all 14 cue recipes stay finite and within source, time, pitch, and gain budgets over seed sweeps', () => {
  assert.equal(AUDIO_CUES.length, 14);
  for (const cue of AUDIO_CUES) for (let seed = 0; seed < 256; seed++) {
    const recipe = audioRecipe(cue, seed);
    assert.equal(recipe.cue, cue);
    assert.ok(recipe.cooldown >= .05 && recipe.cooldown <= 1);
    assert.ok(recipe.layers.length >= 1 && recipe.layers.length <= AUDIO_LIMITS.maxLayersPerCue);
    for (const layer of recipe.layers) {
      for (const [key, value] of Object.entries(layer)) if (key !== 'wave') assert.ok(Number.isFinite(value), `${cue}.${key}`);
      assert.ok(layer.duration > .016 && layer.duration <= AUDIO_LIMITS.maxDuration);
      assert.ok(layer.delay >= 0 && layer.delay <= AUDIO_LIMITS.maxDelay);
      assert.ok(layer.attack > 0 && layer.attack < layer.duration - .008);
      assert.ok(layer.amplitude > 0 && layer.amplitude <= AUDIO_LIMITS.maxAmplitude);
      for (const frequency of [layer.frequency, layer.endFrequency, layer.cutoff]) {
        assert.ok(frequency >= AUDIO_LIMITS.minFrequency && frequency <= AUDIO_LIMITS.maxFrequency);
      }
      assert.ok(Number.isInteger(layer.noiseSeed) && layer.noiseSeed >= 0 && layer.noiseSeed <= 0xffffffff);
    }
  }
});

test('cue variations and noise are reproducible without touching gameplay or global random', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('global random must remain untouched'); };
  try {
    for (const cue of AUDIO_CUES) {
      assert.deepEqual(audioRecipe(cue, 123), audioRecipe(cue, 123));
      assert.notDeepEqual(audioRecipe(cue, 123), audioRecipe(cue, 124));
    }
    assert.deepEqual(audioNoise(9, 48000, .1), audioNoise(9, 48000, .1));
    assert.notDeepEqual(audioNoise(9, 48000, .1), audioNoise(10, 48000, .1));
    const random = audioRandom(0);
    assert.ok(random() !== random(), 'zero seed does not lock the stream');
  } finally { Math.random = original; }
});

test('hostile recipe seeds, noise lengths, and distances remain bounded and quiet', () => {
  for (const cue of AUDIO_CUES) for (const seed of [NaN, Infinity, -Infinity, 1e100, -1, .5]) {
    assert.deepEqual(audioRecipe(cue, seed), audioRecipe(cue, seed));
  }
  for (const sampleRate of [NaN, Infinity, -1, 0, 8000, 48000, 1e100]) for (const duration of [NaN, Infinity, -1, 0, .8, 1e100]) {
    const noise = audioNoise(13, sampleRate, duration);
    assert.ok(noise.length >= 1 && noise.length <= AUDIO_LIMITS.maxNoiseSamples);
    for (const sample of noise) assert.ok(Number.isFinite(sample) && sample >= -1 && sample <= 1);
  }
  assert.equal(audioAttenuation(), 1);
  assert.equal(audioAttenuation(-10), 1);
  assert.ok(audioAttenuation(10) < audioAttenuation(1));
  for (const distance of [48, 1000, NaN, Infinity, -Infinity]) assert.equal(audioAttenuation(distance), 0);
  assert.equal(isAudioCue('__proto__'), false);
  assert.equal(isAudioCue('gather'), true);
});

test('factory and context remain untouched until explicit gesture unlock, with no cue backlog', async () => {
  const h = harness();
  h.audio.resume(); h.audio.setVolume(.4); h.audio.setEnabled(true);
  assert.equal(h.audio.cue('jump'), false);
  assert.equal(h.factories(), 0);
  assert.equal(h.audio.diagnostics().state, 'locked');
  assert.equal(await h.audio.unlock(), true);
  assert.equal(h.factories(), 1);
  assert.equal(h.context.sources.length, 0);
  assert.equal(h.audio.cue('jump'), true);
  assert.equal(h.audio.diagnostics().activeVoices, 2);
  h.audio.dispose();
});

test('concurrent unlock calls share one attempt and rejected gesture can be retried', async () => {
  const h = harness(); h.context.deferResume = true;
  const first = h.audio.unlock(), second = h.audio.unlock();
  assert.equal(first, second); assert.equal(h.context.resumes, 1);
  h.context.deferredResume!(); assert.equal(await first, true);
  h.audio.dispose();
  const blocked = harness(); blocked.context.failResume = true;
  assert.equal(await blocked.audio.unlock(), false);
  assert.equal(blocked.audio.cue('gather'), false);
  blocked.context.failResume = false;
  assert.equal(await blocked.audio.unlock(), true);
  assert.equal(blocked.factories(), 1);
  assert.equal(blocked.audio.diagnostics().errors, 1);
  blocked.audio.dispose();
});

test('voice budget is hard, whole-cue admission avoids partial chords, and natural endings reclaim nodes', async () => {
  const h = harness({ maxVoices: 5 }); await h.audio.unlock();
  assert.equal(h.audio.cue('repair'), true);
  assert.equal(h.audio.cue('gather'), true);
  assert.equal(h.audio.cue('staff-impact'), false);
  assert.equal(h.audio.diagnostics().activeVoices, 5);
  assert.equal(h.context.sources.length, 5);
  h.context.finishAll();
  assert.equal(h.audio.diagnostics().activeVoices, 0);
  assert.equal(h.audio.diagnostics().finishedVoices, 5);
  assert.ok(h.context.sources.every(source => source.disconnected && source.onended === null));
  assert.equal(h.audio.cue('staff-impact'), true);
  assert.equal(h.audio.diagnostics().activeVoices, 3);
  h.audio.dispose();
});

test('hard ceiling survives cue spam, caller budgets, and cooldown time boundaries', async () => {
  const h = harness({ maxVoices: 1000000 }); await h.audio.unlock();
  assert.equal(h.audio.diagnostics().maxVoices, AUDIO_LIMITS.maxVoices);
  for (let i = 0; i < 1000; i++) {
    h.audio.cue(AUDIO_CUES[i % AUDIO_CUES.length]!);
    assert.ok(h.audio.diagnostics().activeVoices <= AUDIO_LIMITS.maxVoices);
  }
  assert.ok(h.audio.diagnostics().droppedCues > 900);
  h.context.finishAll(); h.context.currentTime = 10;
  assert.equal(h.audio.cue('footstep'), true);
  h.context.finishAll();
  assert.equal(h.audio.cue('footstep'), false);
  h.context.currentTime += .12;
  assert.equal(h.audio.cue('footstep'), true);
  h.audio.dispose();
});

test('noise buffers and full envelope scheduling remain bounded and distance attenuates actual gain', async () => {
  const near = harness(), far = harness(); await near.audio.unlock(); await far.audio.unlock();
  near.audio.cue('footstep', { seed: 33 }); far.audio.cue('footstep', { seed: 33, distance: 10 });
  assert.deepEqual(near.context.buffers, far.context.buffers);
  const nearGains = near.context.nodes.filter(node => node instanceof MockGain).slice(1) as MockGain[];
  const farGains = far.context.nodes.filter(node => node instanceof MockGain).slice(1) as MockGain[];
  for (let i = 0; i < nearGains.length; i++) {
    const nearEnvelope = nearGains[i]!.gain.events, farEnvelope = farGains[i]!.gain.events;
    assert.equal(nearEnvelope[0]![1], 0);
    assert.equal(nearEnvelope.at(-1)![1], 0);
    assert.equal(farEnvelope[1]![1], nearEnvelope[1]![1] * .5);
    for (const [, value, time] of nearEnvelope) assert.ok(Number.isFinite(value) && Number.isFinite(time));
  }
  for (const source of near.context.sources) {
    assert.equal(source.starts.length, 1); assert.equal(source.stops.length, 1);
    assert.ok(source.stops[0]! - source.starts[0]! <= AUDIO_LIMITS.maxDuration + .006);
  }
  assert.equal(near.audio.cue('gather', { distance: Infinity }), false);
  near.audio.dispose(); far.audio.dispose();
});

test('mute, zero volume, and game pause immediately stop/disconnect every active source', async () => {
  const h = harness(); await h.audio.unlock();
  for (const action of ['mute', 'zero', 'pause']) {
    h.context.currentTime += 1;
    assert.equal(h.audio.cue('repair'), true);
    if (action === 'mute') h.audio.setEnabled(false);
    if (action === 'zero') h.audio.setVolume(0);
    if (action === 'pause') h.audio.suspend();
    assert.equal(h.audio.diagnostics().activeVoices, 0);
    assert.equal(h.audio.cue('jump'), false);
    assert.ok(h.context.sources.every(source => source.disconnected && source.stops.includes(undefined)));
    h.audio.setEnabled(true); h.audio.setVolume(.5); h.audio.resume();
  }
  h.audio.setVolume(100); assert.equal(h.audio.diagnostics().volume, 1);
  h.audio.setVolume(NaN); assert.equal(h.audio.diagnostics().volume, 1);
  h.audio.setVolume(-1); assert.equal(h.audio.diagnostics().volume, 0);
  h.audio.dispose();
});

test('visibility and page lifecycle flush voices without clearing an explicit game pause', async () => {
  const h = harness(); await h.audio.unlock(); h.audio.cue('water');
  h.visibility.change(true);
  assert.equal(h.audio.diagnostics().activeVoices, 0);
  assert.equal(h.audio.diagnostics().hidden, true);
  assert.equal(h.audio.cue('gather'), false);
  h.audio.suspend(); h.visibility.change(false);
  assert.equal(h.context.state, 'suspended');
  assert.equal(h.audio.diagnostics().paused, true);
  h.audio.resume(); assert.equal(h.audio.cue('water'), true);
  h.lifecycle.dispatchEvent(new Event('pagehide'));
  assert.equal(h.audio.diagnostics().activeVoices, 0);
  assert.equal(h.audio.cue('gather'), false);
  h.lifecycle.dispatchEvent(new Event('pageshow'));
  assert.equal(h.audio.cue('gather'), true);
  h.audio.dispose();
});

test('pending gesture resume cannot revive sound after pause or backgrounding', async () => {
  for (const action of ['pause', 'hidden', 'mute', 'dispose']) {
    const h = harness(); h.context.deferResume = true;
    const unlocked = h.audio.unlock();
    if (action === 'pause') h.audio.suspend();
    if (action === 'hidden') h.visibility.change(true);
    if (action === 'mute') h.audio.setEnabled(false);
    if (action === 'dispose') h.audio.dispose();
    h.context.deferredResume!(); await unlocked;
    assert.equal(h.audio.cue('gather'), false);
    assert.equal(h.audio.diagnostics().activeVoices, 0);
    if (action !== 'dispose') assert.equal(h.context.state, 'suspended');
    h.audio.dispose();
  }
});

test('late suspend completion reconciles a quick foreground return, and repeated unlock respects pause', async () => {
  const h = harness(); await h.audio.unlock();
  const originalResumes = h.context.resumes;
  assert.equal(await h.audio.unlock(), true);
  assert.equal(h.context.resumes, originalResumes, 'running gestures do not repeatedly resume the context');
  h.audio.suspend();
  assert.equal(await h.audio.unlock(), true);
  assert.equal(h.context.state, 'suspended', 'a gesture in a paused menu never unpauses audio');
  h.audio.resume(); await Promise.resolve();
  h.context.deferSuspend = true;
  h.visibility.change(true); h.visibility.change(false);
  h.context.deferredSuspend!(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.context.state, 'running');
  assert.equal(h.audio.cue('jump'), true);
  h.audio.dispose();
});

test('partially initialized audio graphs are closed and a later gesture can retry cleanly', async () => {
  const context = new MockContext();
  const original = context.createDynamicsCompressor;
  let attempts = 0;
  context.createDynamicsCompressor = () => { throw new Error('graph unavailable'); };
  const recovered = new MockContext();
  const audio = createGameAudio({ contextFactory: () => (++attempts === 1 ? context : recovered) as unknown as AudioContext,
    visibilityTarget: null, lifecycleTarget: null });
  assert.equal(await audio.unlock(), false);
  assert.equal(context.closes, 1);
  assert.ok(context.nodes.every(node => node.disconnected));
  assert.equal(audio.diagnostics().activeVoices, 0);
  context.createDynamicsCompressor = original;
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.cue('repair'), true);
  audio.dispose();
});

test('source creation failures roll back the entire cue and leave no leaked voices', async () => {
  const h = harness(); await h.audio.unlock(); h.context.failSourceAt = 2;
  assert.equal(h.audio.cue('repair'), false);
  assert.equal(h.audio.diagnostics().activeVoices, 0);
  assert.equal(h.audio.diagnostics().errors, 1);
  assert.ok(h.context.sources.every(source => source.disconnected));
  assert.equal(h.audio.diagnostics().createdVoices, h.audio.diagnostics().finishedVoices);
  h.context.failSourceAt = 0;
  assert.equal(h.audio.cue('repair'), true, 'failed cue does not poison cooldown');
  h.audio.dispose();
});

test('disposal is idempotent, closes the context once, removes listeners, and blocks future work', async () => {
  const h = harness(); await h.audio.unlock(); h.audio.cue('staff-impact');
  h.audio.dispose(); h.audio.dispose();
  assert.equal(h.context.closes, 1);
  assert.equal(h.audio.diagnostics().activeVoices, 0);
  assert.equal(h.audio.diagnostics().disposed, true);
  assert.ok(h.context.nodes.every(node => node.disconnected));
  const previousResumes = h.context.resumes, previousSuspends = h.context.suspends;
  h.visibility.change(true); h.visibility.change(false);
  h.lifecycle.dispatchEvent(new Event('pagehide')); h.lifecycle.dispatchEvent(new Event('pageshow'));
  h.audio.resume(); h.audio.suspend(); h.audio.setEnabled(true); h.audio.setVolume(1);
  assert.equal(await h.audio.unlock(), false);
  assert.equal(h.audio.cue('jump'), false);
  assert.equal(h.context.resumes, previousResumes);
  assert.equal(h.context.suspends, previousSuspends);
});

test('no-audio and initially disabled environments fail safely without allocating', async () => {
  const audio = createGameAudio({ visibilityTarget: null, lifecycleTarget: null });
  assert.equal(audio.diagnostics().supported, false);
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.cue('jump'), false); audio.dispose();
  const h = harness({ enabled: false });
  assert.equal(await h.audio.unlock(), false); assert.equal(h.factories(), 0);
  h.audio.setEnabled(true); assert.equal(h.factories(), 0);
  assert.equal(await h.audio.unlock(), true);
  h.audio.dispose();
});
