export function reduceVoiceNoise(ctx: AudioContext, input: AudioBuffer) {
  const output = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  const sampleRate = input.sampleRate;
  const analysisLength = Math.min(input.length, Math.max(1, Math.floor(sampleRate * 0.35)));

  for (let channel = 0; channel < input.numberOfChannels; channel++) {
    const source = input.getChannelData(channel);
    const target = output.getChannelData(channel);
    let noiseSum = 0;
    for (let index = 0; index < analysisLength; index++) noiseSum += source[index] * source[index];
    const noiseRms = Math.sqrt(noiseSum / Math.max(1, analysisLength));
    const floor = Math.max(0.0025, Math.min(0.018, noiseRms * 1.9));
    let envelope = 1;
    let low = 0;

    for (let index = 0; index < source.length; index++) {
      const sample = source[index];
      const level = Math.abs(sample);
      const targetEnv = level < floor ? 0.72 : level < floor * 1.8 ? 0.88 : 1;
      envelope += (targetEnv - envelope) * (targetEnv > envelope ? 0.045 : 0.006);

      low += (sample - low) * 0.018;
      const gentleHighPass = sample - low * 0.45;
      target[index] = (sample * 0.72 + gentleHighPass * 0.28) * envelope;
    }
  }

  return output;
}
