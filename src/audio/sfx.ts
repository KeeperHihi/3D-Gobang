let audioContext: AudioContext | null = null;
let masterGainNode: GainNode | null = null;
let bgmGainNode: GainNode | null = null;
let bgmSchedulerTimerId: number | null = null;
let bgmStarted = false;
let bgmNextStartAt = 0;
let bgmChordIndex = 0;

const BGM_STEP_SECONDS = 6.2;
const BGM_CHORD_DURATION_SECONDS = 6.4;
const BGM_SCHEDULE_AHEAD_SECONDS = 16;
const BGM_CHORDS = [
  [174.61, 261.63, 349.23, 523.25], // F3 / C4 / F4 / C5
  [164.81, 246.94, 329.63, 493.88], // E3 / B3 / E4 / B4
  [146.83, 220, 293.66, 440], // D3 / A3 / D4 / A4
  [155.56, 233.08, 311.13, 466.16] // Eb3 / Bb3 / Eb4 / Bb4
] as const;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function ensureMasterGain(context: AudioContext): GainNode {
  if (masterGainNode) {
    return masterGainNode;
  }
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.72, context.currentTime);
  gain.connect(context.destination);
  masterGainNode = gain;
  return gain;
}

function ensureBgmGain(context: AudioContext): GainNode {
  if (bgmGainNode) {
    return bgmGainNode;
  }
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.22, context.currentTime);
  gain.connect(ensureMasterGain(context));
  bgmGainNode = gain;
  return gain;
}

function resumeAudioContext(context: AudioContext): void {
  if (context.state === "suspended") {
    void context.resume();
  }
}

interface ToneOptions {
  frequency: number;
  durationSeconds: number;
  type: OscillatorType;
  volume: number;
  attackSeconds?: number;
  releasePaddingSeconds?: number;
  detuneStartCents?: number;
  detuneEndCents?: number;
}

function playTone(options: ToneOptions) {
  const context = getAudioContext();
  resumeAudioContext(context);
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.frequency, now);
  oscillator.detune.setValueAtTime(options.detuneStartCents ?? 0, now);
  oscillator.detune.linearRampToValueAtTime(options.detuneEndCents ?? 0, now + options.durationSeconds);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(4400, now);
  filter.Q.value = 0.9;

  const attackSeconds = options.attackSeconds ?? 0.015;
  const releasePaddingSeconds = options.releasePaddingSeconds ?? 0.04;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.volume), now + attackSeconds);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + options.durationSeconds);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(ensureMasterGain(context));
  oscillator.start(now);
  oscillator.stop(now + options.durationSeconds + releasePaddingSeconds);
}

function scheduleAmbientChord(
  context: AudioContext,
  startAt: number,
  frequencies: readonly number[]
): void {
  const chordGain = context.createGain();
  const lowpass = context.createBiquadFilter();
  const highpass = context.createBiquadFilter();

  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(1800, startAt);
  lowpass.frequency.linearRampToValueAtTime(2200, startAt + BGM_CHORD_DURATION_SECONDS * 0.7);
  lowpass.Q.value = 0.6;

  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(110, startAt);
  highpass.Q.value = 0.5;

  chordGain.gain.setValueAtTime(0.0001, startAt);
  chordGain.gain.exponentialRampToValueAtTime(0.12, startAt + 1.2);
  chordGain.gain.exponentialRampToValueAtTime(0.06, startAt + BGM_CHORD_DURATION_SECONDS * 0.52);
  chordGain.gain.exponentialRampToValueAtTime(0.0001, startAt + BGM_CHORD_DURATION_SECONDS);

  lowpass.connect(highpass);
  highpass.connect(chordGain);
  chordGain.connect(ensureBgmGain(context));

  for (let index = 0; index < frequencies.length; index += 1) {
    const frequency = frequencies[index];
    const oscillator = context.createOscillator();
    oscillator.type = index % 2 === 0 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.detune.setValueAtTime(index % 2 === 0 ? -3 : 2.5, startAt);
    oscillator.detune.linearRampToValueAtTime(index % 2 === 0 ? 3 : -2.5, startAt + BGM_CHORD_DURATION_SECONDS);
    oscillator.connect(lowpass);
    oscillator.start(startAt);
    oscillator.stop(startAt + BGM_CHORD_DURATION_SECONDS + 0.08);

    if (index === frequencies.length - 1) {
      const shimmer = context.createOscillator();
      const shimmerGain = context.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(frequency * 2, startAt);
      shimmer.detune.setValueAtTime(7, startAt);
      shimmerGain.gain.setValueAtTime(0.0001, startAt);
      shimmerGain.gain.exponentialRampToValueAtTime(0.018, startAt + 0.9);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, startAt + BGM_CHORD_DURATION_SECONDS - 0.5);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(lowpass);
      shimmer.start(startAt);
      shimmer.stop(startAt + BGM_CHORD_DURATION_SECONDS);
    }
  }
}

function scheduleAmbientBgmWindow(): void {
  if (!bgmStarted) {
    return;
  }
  const context = getAudioContext();
  resumeAudioContext(context);
  const now = context.currentTime;
  if (bgmNextStartAt <= now) {
    bgmNextStartAt = now + 0.16;
  }

  while (bgmNextStartAt < now + BGM_SCHEDULE_AHEAD_SECONDS) {
    scheduleAmbientChord(context, bgmNextStartAt, BGM_CHORDS[bgmChordIndex]);
    bgmChordIndex = (bgmChordIndex + 1) % BGM_CHORDS.length;
    bgmNextStartAt += BGM_STEP_SECONDS;
  }
}

export function activateAudioAmbience(): void {
  try {
    const context = getAudioContext();
    resumeAudioContext(context);
    ensureMasterGain(context);
    ensureBgmGain(context);
    if (bgmStarted) {
      return;
    }
    bgmStarted = true;
    bgmNextStartAt = context.currentTime + 0.12;
    scheduleAmbientBgmWindow();
    if (typeof window !== "undefined" && bgmSchedulerTimerId === null) {
      bgmSchedulerTimerId = window.setInterval(() => {
        scheduleAmbientBgmWindow();
      }, 1900);
    }
  } catch {}
}

export function playDropSfx() {
  try {
    playTone({
      frequency: 520,
      durationSeconds: 0.24,
      type: "triangle",
      volume: 0.095,
      attackSeconds: 0.012,
      detuneStartCents: -8,
      detuneEndCents: 6
    });
    setTimeout(() => {
      playTone({
        frequency: 780,
        durationSeconds: 0.16,
        type: "sine",
        volume: 0.05,
        attackSeconds: 0.01,
        detuneStartCents: 4,
        detuneEndCents: -6
      });
    }, 34);
  } catch {}
}

export function playWinSfx() {
  try {
    const sequence = [
      { frequency: 392, delayMs: 0, durationSeconds: 0.24, volume: 0.08 },
      { frequency: 523.25, delayMs: 110, durationSeconds: 0.28, volume: 0.09 },
      { frequency: 659.25, delayMs: 240, durationSeconds: 0.34, volume: 0.1 },
      { frequency: 783.99, delayMs: 410, durationSeconds: 0.42, volume: 0.095 }
    ];
    sequence.forEach((note) => {
      setTimeout(() => {
        playTone({
          frequency: note.frequency,
          durationSeconds: note.durationSeconds,
          type: "sine",
          volume: note.volume,
          attackSeconds: 0.018,
          detuneStartCents: -5,
          detuneEndCents: 7
        });
      }, note.delayMs);
    });
  } catch {}
}

export function playTurnNudgeSfx() {
  try {
    playTone({
      frequency: 560,
      durationSeconds: 0.12,
      type: "sine",
      volume: 0.05,
      attackSeconds: 0.01,
      detuneStartCents: -4,
      detuneEndCents: 4
    });
    setTimeout(() => {
      playTone({
        frequency: 724,
        durationSeconds: 0.15,
        type: "triangle",
        volume: 0.045,
        attackSeconds: 0.01,
        detuneStartCents: 3,
        detuneEndCents: -3
      });
    }, 85);
  } catch {}
}
