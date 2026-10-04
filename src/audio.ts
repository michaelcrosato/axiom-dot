import { AUDIO_LIMITS, audioAttenuation, audioNoise, audioRecipe, isAudioCue } from './audio-recipes.ts';
import type { AudioCueName, AudioLayer } from './audio-recipes.ts';

export type { AudioCueName } from './audio-recipes.ts';

export interface AudioCueOptions {
  /** Listener-to-source distance in world metres. Omit for player/UI-local sounds. */
  distance?: number;
  /** Sound-local seed; never advances or reads the world's random stream. */
  seed?: number;
}

export interface AudioVisibilityTarget extends EventTarget { readonly hidden: boolean }

export interface GameAudioOptions {
  enabled?: boolean;
  volume?: number;
  /** Lower budgets are supported; values above the hard 12-source ceiling are clamped. */
  maxVoices?: number;
  /** Optional dependency injection for tests, not required by the game. */
  contextFactory?: () => AudioContext;
  visibilityTarget?: AudioVisibilityTarget | null;
  lifecycleTarget?: EventTarget | null;
}

export interface GameAudioDiagnostics {
  supported: boolean;
  enabled: boolean;
  volume: number;
  unlocked: boolean;
  paused: boolean;
  hidden: boolean;
  disposed: boolean;
  state: AudioContextState | 'locked' | 'unavailable';
  activeVoices: number;
  maxVoices: number;
  playedCues: number;
  droppedCues: number;
  createdVoices: number;
  finishedVoices: number;
  errors: number;
  lastError: string | null;
}

export interface GameAudio {
  /** Call directly inside a trusted pointer/key handler. Creates no sound by itself. */
  unlock(): Promise<boolean>;
  /** Returns false when locked, paused, inaudible, throttled, or over budget. Never queues. */
  cue(name: AudioCueName, options?: AudioCueOptions): boolean;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  /** Stops all voices immediately and suspends the context. */
  suspend(): void;
  /** Clears the game pause; cannot create/unlock an AudioContext. */
  resume(): void;
  dispose(): void;
  diagnostics(): GameAudioDiagnostics;
}

interface LiveVoice {
  source: AudioScheduledSourceNode;
  release(stop: boolean): void;
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function browserContextFactory(): (() => AudioContext) | null {
  const browser = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Context = browser.AudioContext ?? browser.webkitAudioContext;
  return Context ? () => new Context({ latencyHint: 'interactive' }) : null;
}

/** Bounded, best-effort one-shot synthesis, independent of renderer and simulation. */
export function createGameAudio(options: GameAudioOptions = {}): GameAudio {
  const factory = options.contextFactory ?? browserContextFactory();
  const visibility = options.visibilityTarget === undefined
    ? (typeof document === 'undefined' ? null : document) : options.visibilityTarget;
  const lifecycle = options.lifecycleTarget === undefined
    ? (typeof window === 'undefined' ? null : window) : options.lifecycleTarget;
  const maxVoices = Math.floor(bounded(options.maxVoices, AUDIO_LIMITS.maxVoices, 1, AUDIO_LIMITS.maxVoices));
  const voices = new Set<LiveVoice>();
  const lastCue = new Map<AudioCueName, number>();
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let enabled = options.enabled ?? true;
  let volume = bounded(options.volume, .5, 0, 1);
  let unlocked = false;
  let paused = false;
  let pageHidden = false;
  let disposed = false;
  let unlockAttempt: Promise<boolean> | null = null;
  let variation = 0;
  let playedCues = 0;
  let droppedCues = 0;
  let createdVoices = 0;
  let finishedVoices = 0;
  let errors = 0;
  let lastError: string | null = null;
  const hidden = () => pageHidden || Boolean(visibility?.hidden);
  const shouldSuspend = () => disposed || paused || hidden() || !enabled || volume === 0;
  const recordError = (error: unknown) => {
    errors++;
    lastError = error instanceof Error ? error.message : String(error);
  };
  const stopVoices = () => {
    for (const voice of [...voices]) voice.release(true);
    lastCue.clear();
  };
  const suspendContext = () => {
    stopVoices();
    const current = context;
    if (current && current.state !== 'closed') {
      try {
        void current.suspend().then(() => {
          // A quick foreground/unpause may overtake an asynchronous suspension.
          if (!shouldSuspend() && unlocked) resumeContext();
        }).catch(recordError);
      } catch (error) { recordError(error); }
    }
  };
  const resumeContext = () => {
    const current = context;
    if (!current || !unlocked || shouldSuspend() || current.state === 'closed') return;
    try {
      void current.resume().then(() => {
        // Pause/visibility may have changed while the browser was resolving resume.
        if (shouldSuspend() && !disposed) suspendContext();
      }).catch(recordError);
    } catch (error) { recordError(error); }
  };
  const updateMaster = () => {
    if (!master || !context || context.state === 'closed') return;
    try {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(enabled ? volume * AUDIO_LIMITS.masterGain : 0, now, .012);
    } catch (error) { recordError(error); }
  };
  const onVisibility = () => { if (hidden()) suspendContext(); else resumeContext(); };
  const onPageHide = () => { pageHidden = true; suspendContext(); };
  const onPageShow = () => { pageHidden = false; onVisibility(); };
  visibility?.addEventListener('visibilitychange', onVisibility);
  lifecycle?.addEventListener('pagehide', onPageHide);
  lifecycle?.addEventListener('pageshow', onPageShow);

  function startLayer(current: AudioContext, layer: AudioLayer, start: number, attenuation: number): LiveVoice {
    const nodes: AudioNode[] = [];
    let source: AudioScheduledSourceNode | null = null;
    let live: LiveVoice | null = null;
    try {
      const gain = current.createGain(); nodes.push(gain);
      const filter = current.createBiquadFilter(); nodes.push(filter);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(layer.cutoff, current.sampleRate * .45), start);
      filter.Q.setValueAtTime(.45, start);
      if (layer.wave === 'noise') {
        const noise = current.createBufferSource(); source = noise; nodes.push(noise);
        const samples = audioNoise(layer.noiseSeed, current.sampleRate, layer.duration);
        const buffer = current.createBuffer(1, samples.length, current.sampleRate);
        buffer.getChannelData(0).set(samples);
        noise.buffer = buffer;
      } else {
        const oscillator = current.createOscillator(); source = oscillator; nodes.push(oscillator);
        oscillator.type = layer.wave;
        oscillator.frequency.setValueAtTime(layer.frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(layer.endFrequency, start + layer.duration);
      }
      const end = start + layer.duration;
      const amplitude = layer.amplitude * attenuation;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(amplitude, start + layer.attack);
      gain.gain.exponentialRampToValueAtTime(.00001, end - .008);
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(filter); filter.connect(gain); gain.connect(master!);
      const ownedSource = source;
      let released = false;
      live = {
        source: ownedSource,
        release(stop) {
          if (released) return;
          released = true;
          ownedSource.onended = null;
          if (stop) { try { ownedSource.stop(); } catch { /* Already stopped or not started. */ } }
          for (const node of nodes) { try { node.disconnect(); } catch { /* Best-effort teardown. */ } }
          voices.delete(live!);
          finishedVoices++;
        },
      };
      voices.add(live); createdVoices++;
      ownedSource.onended = () => live?.release(false);
      ownedSource.start(start);
      ownedSource.stop(end + .005);
      return live;
    } catch (error) {
      if (live) live.release(true);
      else {
        if (source) { try { source.stop(); } catch { /* Not yet started. */ } }
        for (const node of nodes) { try { node.disconnect(); } catch { /* Best-effort teardown. */ } }
      }
      throw error;
    }
  }

  return {
    unlock() {
      if (disposed || !enabled || !factory) return Promise.resolve(false);
      if (unlockAttempt) return unlockAttempt;
      if (unlocked && (shouldSuspend() || context?.state === 'running')) return Promise.resolve(true);
      try {
        if (!context) {
          context = factory();
          master = context.createGain();
          compressor = context.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-20, context.currentTime);
          compressor.knee.setValueAtTime(16, context.currentTime);
          compressor.ratio.setValueAtTime(3, context.currentTime);
          compressor.attack.setValueAtTime(.006, context.currentTime);
          compressor.release.setValueAtTime(.12, context.currentTime);
          master.gain.setValueAtTime(volume * AUDIO_LIMITS.masterGain, context.currentTime);
          master.connect(compressor); compressor.connect(context.destination);
        }
        const current = context;
        // Called synchronously here, while the host's trusted gesture is still active.
        unlockAttempt = current.resume().then(() => {
          if (disposed || current.state === 'closed') return false;
          unlocked = current.state === 'running';
          if (shouldSuspend()) suspendContext();
          return unlocked;
        }).catch(error => { recordError(error); return false; }).finally(() => { unlockAttempt = null; });
        return unlockAttempt;
      } catch (error) {
        recordError(error);
        // Partial graph initialization must not retain a broken context or nodes.
        stopVoices();
        try { master?.disconnect(); compressor?.disconnect(); } catch { /* Best effort. */ }
        if (context && context.state !== 'closed') { try { void context.close().catch(recordError); } catch { /* Best effort. */ } }
        context = null; master = null; compressor = null; unlocked = false;
        return Promise.resolve(false);
      }
    },
    cue(name, cueOptions = {}) {
      const current = context;
      const attenuation = audioAttenuation(cueOptions.distance);
      if (!isAudioCue(name) || !current || !unlocked || shouldSuspend() || current.state !== 'running' || attenuation === 0) {
        droppedCues++; return false;
      }
      const recipe = audioRecipe(name, cueOptions.seed ?? variation);
      const now = current.currentTime;
      const previous = lastCue.get(name);
      if ((previous !== undefined && now - previous < recipe.cooldown) || voices.size + recipe.layers.length > maxVoices) {
        droppedCues++; return false;
      }
      const started: LiveVoice[] = [];
      try {
        for (const layer of recipe.layers) started.push(startLayer(current, layer, now + .004 + layer.delay, attenuation));
        lastCue.set(name, now);
        variation = (variation + 1) >>> 0;
        playedCues++;
        return true;
      } catch (error) {
        for (const voice of started) voice.release(true);
        recordError(error); droppedCues++;
        return false;
      }
    },
    setEnabled(value) {
      if (disposed) return;
      enabled = Boolean(value); updateMaster();
      if (shouldSuspend()) suspendContext(); else resumeContext();
    },
    setVolume(value) {
      if (disposed) return;
      volume = bounded(value, volume, 0, 1); updateMaster();
      if (shouldSuspend()) suspendContext(); else resumeContext();
    },
    suspend() { if (!disposed) { paused = true; suspendContext(); } },
    resume() { if (!disposed) { paused = false; resumeContext(); } },
    dispose() {
      if (disposed) return;
      disposed = true; unlocked = false;
      stopVoices();
      visibility?.removeEventListener('visibilitychange', onVisibility);
      lifecycle?.removeEventListener('pagehide', onPageHide);
      lifecycle?.removeEventListener('pageshow', onPageShow);
      try { master?.disconnect(); compressor?.disconnect(); } catch (error) { recordError(error); }
      if (context && context.state !== 'closed') { try { void context.close().catch(recordError); } catch (error) { recordError(error); } }
      master = null; compressor = null;
    },
    diagnostics() {
      return { supported: factory !== null, enabled, volume, unlocked, paused, hidden: hidden(), disposed,
        state: context?.state ?? (factory ? 'locked' : 'unavailable'), activeVoices: voices.size,
        maxVoices, playedCues, droppedCues, createdVoices, finishedVoices, errors, lastError };
    },
  };
}
