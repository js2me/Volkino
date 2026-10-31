export type AudioFixMode = 'off' | 'moderate' | 'night';

export const audioFixNames: Record<AudioFixMode, string> = {
  off: 'Выключен', moderate: 'Умеренный', night: 'Ночной',
};

const presets = {
  moderate: { threshold: -24, knee: 18, ratio: 4, attack: .008, release: .28, gain: 1.25 },
  night: { threshold: -34, knee: 24, ratio: 10, attack: .003, release: .4, gain: 1.35 },
};

/** Stereo speaker downmix, dynamic range compression, makeup and peak protection. */
export function buildAudioGraph(context: BaseAudioContext, mode: Exclude<AudioFixMode, 'off'>) {
  const preset = presets[mode];
  const input = context.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = preset.threshold;
  compressor.knee.value = preset.knee;
  compressor.ratio.value = preset.ratio;
  compressor.attack.value = preset.attack;
  compressor.release.value = preset.release;
  const makeup = context.createGain();
  makeup.gain.value = preset.gain;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = .001;
  limiter.release.value = .09;
  // A final ceiling also bounds transient overshoot during the limiter's attack.
  const ceiling = context.createWaveShaper();
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.max(-.92, Math.min(.92, 2 * i / (curve.length - 1) - 1));
  ceiling.curve = curve;
  const headroom = context.createGain();
  headroom.gain.value = .8;
  input.connect(compressor).connect(makeup).connect(limiter).connect(ceiling).connect(headroom).connect(context.destination);
  return { input, dispose() { [input, compressor, makeup, limiter, ceiling, headroom].forEach(node => node.disconnect()); } };
}
