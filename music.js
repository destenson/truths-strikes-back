// Procedural orchestral march, generated entirely in-browser via Web Audio.
// The motif is original (not lifted from any film score) — a minor-key brass
// march for an ominous-heroic mood. No audio files, nothing to license.
//
// Audio can only begin from a user gesture (browser autoplay policy), so this
// module injects its own toggle button and starts/stops the graph on click.

const TEMPO_BPM = 100;
const SECONDS_PER_BEAT = 60 / TEMPO_BPM;
const LOOP_BEATS = 16;
const MASTER_VOLUME = 0.22;

// Scheduler: look a little ahead and queue notes whose start time falls within
// the window, so timing stays sample-accurate regardless of timer jitter.
const SCHEDULE_AHEAD_SECONDS = 0.2;
const SCHEDULER_INTERVAL_MS = 25;

const A4_MIDI = 69;
const A4_FREQUENCY_HZ = 440;

function midiToFrequency(midi) {
  return A4_FREQUENCY_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

// TODO: add several melodies that play randomly. They should all sound ominous and dramatic, but different enough to be interesting over multiple loops.
// Original brass melody as [beatOffset, midiNote, durationBeats] within the loop.
const MELODY = [
  [0, 62, 1], [1, 62, 1], [2, 65, 1], [3, 64, 1],
  [4, 62, 1], [5, 57, 1], [6, 58, 2],
  [8, 60, 1], [9, 60, 1], [10, 65, 1], [11, 64, 1],
  [12, 62, 1], [13, 57, 1], [14, 62, 2],
];

// One bass root per bar, pulsed on every eighth note for march drive.
const BASS_ROOTS_BY_BAR = [38, 38, 41, 45];
const BASS_PULSE_BEATS = 0.5;

// Timpani-ish hits every other beat.
const TIMPANI_BEATS = [0, 2, 4, 6, 8, 10, 12, 14];

function createToggleButton(onToggle) {
  const button = document.createElement("button");
  button.className = "sound-toggle";
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  button.textContent = "▶ Enable sound";
  button.addEventListener("click", () => onToggle(button));
  document.body.appendChild(button);
  return button;
}

// Detuned-sawtooth "brass" voice through a lowpass, with an ADSR envelope.
function playBrass(ctx, destination, frequency, startTime, durationSeconds) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, startTime);
  filter.frequency.linearRampToValueAtTime(2600, startTime + 0.06);
  filter.frequency.linearRampToValueAtTime(1400, startTime + durationSeconds);

  const envelope = ctx.createGain();
  const peak = 0.5;
  const sustain = 0.34;
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(peak, startTime + 0.03);
  envelope.gain.linearRampToValueAtTime(sustain, startTime + 0.12);
  envelope.gain.setValueAtTime(sustain, startTime + durationSeconds - 0.08);
  envelope.gain.linearRampToValueAtTime(0, startTime + durationSeconds);

  filter.connect(envelope).connect(destination);

  for (const detune of [-7, 7]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(startTime);
    osc.stop(startTime + durationSeconds + 0.02);
  }
}

function playBass(ctx, destination, frequency, startTime) {
  const durationSeconds = BASS_PULSE_BEATS * SECONDS_PER_BEAT * 0.9;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(0.45, startTime + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);

  filter.connect(envelope).connect(destination);

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = frequency;
  osc.connect(filter);
  osc.start(startTime);
  osc.stop(startTime + durationSeconds + 0.02);
}

// Timpani hit: a sine with a fast downward pitch sweep and quick decay.
function playTimpani(ctx, destination, startTime) {
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.7, startTime);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);
  envelope.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, startTime);
  osc.frequency.exponentialRampToValueAtTime(55, startTime + 0.18);
  osc.connect(envelope);
  osc.start(startTime);
  osc.stop(startTime + 0.4);
}

function scheduleLoop(ctx, destination, loopStartTime) {
  for (const [beat, midi, beats] of MELODY) {
    playBrass(
      ctx,
      destination,
      midiToFrequency(midi),
      loopStartTime + beat * SECONDS_PER_BEAT,
      beats * SECONDS_PER_BEAT * 0.92,
    );
  }

  const pulsesPerBar = 1 / BASS_PULSE_BEATS * 4;
  for (let bar = 0; bar < BASS_ROOTS_BY_BAR.length; bar++) {
    for (let pulse = 0; pulse < pulsesPerBar; pulse++) {
      const beat = bar * 4 + pulse * BASS_PULSE_BEATS;
      playBass(
        ctx,
        destination,
        midiToFrequency(BASS_ROOTS_BY_BAR[bar]),
        loopStartTime + beat * SECONDS_PER_BEAT,
      );
    }
  }

  for (const beat of TIMPANI_BEATS) {
    playTimpani(ctx, destination, loopStartTime + beat * SECONDS_PER_BEAT);
  }
}

function start(state) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const master = ctx.createGain();
  master.gain.value = MASTER_VOLUME;
  // Guard against summed-voice clipping.
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor).connect(ctx.destination);

  state.ctx = ctx;
  state.destination = master;

  const loopSeconds = LOOP_BEATS * SECONDS_PER_BEAT;
  // Start the first loop slightly ahead so its opening note isn't clipped.
  state.nextLoopTime = ctx.currentTime + 0.1;

  state.timer = setInterval(() => {
    while (state.nextLoopTime < ctx.currentTime + SCHEDULE_AHEAD_SECONDS) {
      scheduleLoop(ctx, master, state.nextLoopTime);
      state.nextLoopTime += loopSeconds;
    }
  }, SCHEDULER_INTERVAL_MS);
}

function stop(state) {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (state.ctx) {
    state.ctx.close();
    state.ctx = null;
  }
}

function initMusic() {
  const state = { ctx: null, destination: null, timer: null, nextLoopTime: 0, playing: false };

  createToggleButton((button) => {
    if (state.playing) {
      stop(state);
      state.playing = false;
      button.setAttribute("aria-pressed", "false");
      button.textContent = "▶ Enable sound";
    } else {
      start(state);
      state.playing = true;
      button.setAttribute("aria-pressed", "true");
      button.textContent = "■ Stop sound";
    }
  });
}

initMusic();
