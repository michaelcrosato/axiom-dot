/** Pure, bounded sound descriptions. No renderer, browser, or gameplay RNG dependency. */
export const AUDIO_CUES = [
  'footstep', 'jump', 'land', 'staff-prep', 'staff-impact', 'staff-whiff',
  'enemy-telegraph', 'hurt', 'gather', 'repair', 'water', 'guard-windup', 'guard-block', 'guard-break',
] as const;
export type AudioCueName = typeof AUDIO_CUES[number];
export type AudioWave = 'sine' | 'triangle' | 'noise';

export const AUDIO_LIMITS = Object.freeze({
  maxVoices: 12,
  maxLayersPerCue: 3,
  maxDuration: 0.8,
  maxDelay: 0.2,
  minFrequency: 30,
  maxFrequency: 8000,
  maxAmplitude: 0.16,
  maxDistance: 48,
  maxNoiseSamples: 153600,
  masterGain: 0.4,
});

export interface AudioLayer {
  readonly wave: AudioWave;
  readonly frequency: number;
  readonly endFrequency: number;
  readonly duration: number;
  readonly delay: number;
  readonly attack: number;
  readonly amplitude: number;
  readonly cutoff: number;
  readonly noiseSeed: number;
}

export interface AudioRecipe {
  readonly cue: AudioCueName;
  readonly seed: number;
  readonly cooldown: number;
  readonly layers: readonly AudioLayer[];
}

type LayerSpec = readonly [wave: AudioWave, frequency: number, endFrequency: number,
  duration: number, amplitude: number, cutoff: number, delay?: number, attack?: number];

const RECIPES: Readonly<Record<AudioCueName, { cooldown: number; layers: readonly LayerSpec[] }>> = {
  footstep: { cooldown: .11, layers: [['noise', 120, 90, .075, .075, 610], ['sine', 92, 64, .065, .08, 680]] },
  jump: { cooldown: .16, layers: [['triangle', 180, 320, .16, .095, 1400], ['noise', 180, 200, .09, .04, 1100]] },
  land: { cooldown: .15, layers: [['sine', 116, 48, .18, .13, 900], ['noise', 160, 80, .13, .065, 800]] },
  'staff-prep': { cooldown: .12, layers: [['sine', 260, 440, .19, .085, 2100], ['triangle', 520, 660, .13, .027, 2000, .035]] },
  'staff-impact': { cooldown: .09, layers: [['sine', 300, 72, .22, .14, 2400], ['noise', 600, 160, .1, .08, 2200], ['triangle', 880, 440, .2, .042, 2500, .015]] },
  'staff-whiff': { cooldown: .12, layers: [['noise', 600, 220, .16, .055, 1400], ['sine', 340, 210, .14, .04, 1700]] },
  'guard-windup': { cooldown: .1, layers: [['sine', 240, 620, .12, .072, 1800], ['triangle', 480, 930, .1, .028, 2400]] },
  'guard-block': { cooldown: .08, layers: [['triangle', 840, 310, .22, .105, 2800], ['sine', 1260, 630, .28, .066, 3200], ['noise', 600, 200, .08, .04, 1400]] },
  'guard-break': { cooldown: .12, layers: [['sine', 310, 110, .16, .065, 1300]] },
  'enemy-telegraph': { cooldown: .28, layers: [['triangle', 185, 220, .25, .065, 950], ['sine', 370, 440, .21, .06, 1800, .085]] },
  hurt: { cooldown: .3, layers: [['triangle', 150, 68, .26, .095, 1100], ['noise', 400, 90, .12, .048, 680]] },
  gather: { cooldown: .12, layers: [['sine', 523.25, 523.25, .23, .087, 3200], ['sine', 783.99, 783.99, .26, .061, 3600, .075]] },
  repair: { cooldown: .3, layers: [['triangle', 261.63, 261.63, .24, .056, 2300], ['sine', 392, 392, .3, .08, 2800, .065], ['sine', 523.25, 523.25, .36, .056, 3200, .13]] },
  water: { cooldown: .22, layers: [['noise', 180, 130, .24, .033, 1000, 0, .03], ['sine', 620, 360, .12, .037, 1800, .045, .012]] },
};

export function isAudioCue(value: unknown): value is AudioCueName {
  return typeof value === 'string' && Object.hasOwn(RECIPES, value);
}

/** Local PRNG: even seed zero has a useful deterministic stream. */
export function audioRandom(seed: number): () => number {
  let state = Number.isFinite(seed) ? seed >>> 0 : 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Equal cue + seed produces exactly equal layers. Different seeds gently alter timbre. */
export function audioRecipe(cue: AudioCueName, seed = 0): AudioRecipe {
  const normalizedSeed = Number.isFinite(seed) ? seed >>> 0 : 0;
  const random = audioRandom(normalizedSeed ^ Math.imul(AUDIO_CUES.indexOf(cue) + 1, 0x9e3779b1));
  const recipe = RECIPES[cue];
  const pitch = .97 + random() * .06;
  return {
    cue, seed: normalizedSeed, cooldown: recipe.cooldown,
    layers: recipe.layers.map(([wave, frequency, endFrequency, duration, amplitude, cutoff, delay = 0, attack = .008]) => ({
      wave, frequency: frequency * pitch, endFrequency: endFrequency * pitch,
      duration, delay, attack, amplitude: amplitude * (.94 + random() * .06),
      cutoff: cutoff * (.94 + random() * .12), noiseSeed: (random() * 4294967296) >>> 0,
    })),
  };
}

/** Non-spatial falloff supplied in world metres; invalid input fails quiet. */
export function audioAttenuation(distance = 0): number {
  if (!Number.isFinite(distance) || distance >= AUDIO_LIMITS.maxDistance) return 0;
  return 1 / (1 + (Math.max(0, distance) / 10) ** 2);
}

/** A short, seeded noise buffer. Allocation stays bounded even for hostile inputs. */
export function audioNoise(seed: number, sampleRate: number, duration: number): Float32Array {
  const rate = Number.isFinite(sampleRate) ? Math.min(192000, Math.max(8000, sampleRate)) : 48000;
  const seconds = Number.isFinite(duration) ? Math.min(AUDIO_LIMITS.maxDuration, Math.max(0, duration)) : 0;
  const samples = new Float32Array(Math.min(AUDIO_LIMITS.maxNoiseSamples, Math.max(1, Math.ceil(rate * seconds))));
  const random = audioRandom(seed);
  // A little one-pole smoothing keeps the noise woody rather than brittle.
  let previous = 0;
  for (let i = 0; i < samples.length; i++) {
    previous = previous * .42 + (random() * 2 - 1) * .58;
    samples[i] = previous;
  }
  return samples;
}
