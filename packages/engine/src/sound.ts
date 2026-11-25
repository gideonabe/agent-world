import { useEffect } from 'react';

/**
 * Ambient sound for each world, synthesized with the Web Audio API (no audio files). Browsers only allow
 * audio after the viewer interacts with the page, so it starts off: turn it on from a click (e.g. a mute
 * button) with <AgentWorld sound />.
 */

type Stop = () => void;
type Ambience = (ctx: AudioContext, out: AudioNode) => Stop;

const BPM = 118;

function noiseBuffer(ctx: AudioContext, seconds = 2, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

/** Endless filtered noise bed (wind, traffic, murmur, room tone). Returns its gain so callers can modulate it. */
function bed(ctx: AudioContext, out: AudioNode, opts: { type: BiquadFilterType; freq: number; q?: number; gain: number; brown?: boolean; lfo?: number }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 3, opts.brown);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = opts.type;
  f.frequency.value = opts.freq;
  f.Q.value = opts.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.value = opts.gain;
  src.connect(f).connect(g).connect(out);
  let lfo: OscillatorNode | undefined;
  if (opts.lfo) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = opts.lfo;
    const depth = ctx.createGain();
    depth.gain.value = opts.gain * 0.5;
    lfo.connect(depth).connect(g.gain);
    lfo.start();
  }
  src.start();
  return () => {
    src.stop();
    lfo?.stop();
  };
}

/** Calls `fn` at random intervals between `min` and `max` seconds. */
function every(min: number, max: number, fn: () => void): Stop {
  let t: ReturnType<typeof setTimeout>;
  const next = () => {
    t = setTimeout(() => {
      fn();
      next();
    }, (min + Math.random() * (max - min)) * 1000);
  };
  next();
  return () => clearTimeout(t);
}

function tone(ctx: AudioContext, out: AudioNode, o: { type: OscillatorType; from: number; to?: number; at?: number; dur: number; gain: number; attack?: number }) {
  const at = o.at ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.from, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain, at + (o.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + o.dur + 0.05);
}

function burst(ctx: AudioContext, out: AudioNode, o: { at?: number; dur: number; gain: number; freq: number; type?: BiquadFilterType }) {
  const at = o.at ?? ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, o.dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'highpass';
  f.frequency.value = o.freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(at);
}

const AMBIENCES: Record<string, Ambience> = {
  'meadow-island': (ctx, out) => {
    const stops = [
      bed(ctx, out, { type: 'lowpass', freq: 500, gain: 0.25, lfo: 0.08 }), // wind
      bed(ctx, out, { type: 'bandpass', freq: 900, q: 0.4, gain: 0.08, lfo: 0.12 }), // waves
      every(2, 6, () => {
        const f = 2200 + Math.random() * 1600;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++)
          tone(ctx, out, { type: 'sine', from: f, to: f * 1.35, at: ctx.currentTime + i * 0.13, dur: 0.09, gain: 0.05 });
      }),
    ];
    return () => stops.forEach((s) => s());
  },
  office: (ctx, out) => {
    const stops = [
      bed(ctx, out, { type: 'lowpass', freq: 220, gain: 0.35, brown: true }), // air conditioning
      every(0.08, 0.5, () => burst(ctx, out, { dur: 0.03, gain: 0.05, freq: 2500 })), // keyboards
      every(9, 20, () => tone(ctx, out, { type: 'sine', from: 880, dur: 0.35, gain: 0.04 })), // a notification
    ];
    return () => stops.forEach((s) => s());
  },
  city: (ctx, out) => {
    const stops = [
      bed(ctx, out, { type: 'lowpass', freq: 160, gain: 0.55, brown: true, lfo: 0.05 }), // traffic rumble
      bed(ctx, out, { type: 'bandpass', freq: 700, q: 0.5, gain: 0.05 }), // distant hiss
      every(7, 18, () => {
        const at = ctx.currentTime;
        tone(ctx, out, { type: 'square', from: 392, at, dur: 0.22, gain: 0.025 });
        tone(ctx, out, { type: 'square', from: 494, at, dur: 0.22, gain: 0.02 });
      }),
    ];
    return () => stops.forEach((s) => s());
  },
  market: (ctx, out) => {
    const stops = [
      bed(ctx, out, { type: 'bandpass', freq: 480, q: 1.2, gain: 0.3, lfo: 0.6 }), // crowd murmur
      bed(ctx, out, { type: 'bandpass', freq: 1100, q: 2, gain: 0.07, lfo: 1.3 }),
      every(5, 14, () => tone(ctx, out, { type: 'triangle', from: 1320, dur: 0.9, gain: 0.04 })), // a stall bell
    ];
    return () => stops.forEach((s) => s());
  },
  party: (ctx, out) => {
    const beat = 60 / BPM;
    const bass = [55, 55, 65.41, 49];
    let next = ctx.currentTime + 0.1;
    let step = 0;
    // schedule a little ahead, the standard Web Audio pattern for steady timing
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.3) {
        const s = step % 16;
        if (s % 4 === 0) tone(ctx, out, { type: 'sine', from: 140, to: 45, at: next, dur: 0.25, gain: 0.55 }); // kick
        if (s % 4 === 2) burst(ctx, out, { at: next, dur: 0.05, gain: 0.08, freq: 7000 }); // hi-hat
        if (s % 8 === 4) burst(ctx, out, { at: next, dur: 0.12, gain: 0.12, freq: 1500, type: 'bandpass' }); // clap
        if (s % 2 === 0) tone(ctx, out, { type: 'sawtooth', from: bass[Math.floor(step / 16) % 4]!, at: next, dur: beat * 0.45, gain: 0.07 });
        next += beat / 4;
        step++;
      }
    }, 50);
    return () => clearInterval(timer);
  },
};

/** Plays the ambience for `worldId` while `enabled` is true. */
export function useAmbientSound(worldId: string, enabled: boolean, volume = 0.35) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('AudioContext' in window)) return;
    const play = AMBIENCES[worldId] ?? AMBIENCES['meadow-island']!;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.5);
    master.connect(ctx.destination);
    void ctx.resume();
    const stop = play(ctx, master);
    return () => {
      stop();
      void ctx.close();
    };
  }, [worldId, enabled, volume]);
}
