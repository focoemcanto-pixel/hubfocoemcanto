export function reduceVoiceNoise(ctx: AudioContext, input: AudioBuffer) {
  const output = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  const sampleRate = input.sampleRate;
  const analysisLength = Math.min(input.length, Math.max(1, Math.floor(sampleRate * 0.45)));

  for (let channel = 0; channel < input.numberOfChannels; channel++) {
    const source = input.getChannelData(channel);
    const target = output.getChannelData(channel);
    let noiseSum = 0;
    for (let index = 0; index < analysisLength; index++) noiseSum += source[index] * source[index];
    const noiseRms = Math.sqrt(noiseSum / Math.max(1, analysisLength));
    const gate = Math.max(0.006, Math.min(0.035, noiseRms * 2.8));
    let envelope = 0;
    let previous = 0;

    for (let index = 0; index < source.length; index++) {
      const sample = source[index];
      const level = Math.abs(sample);
      const targetEnv = level < gate ? 0.18 : level < gate * 2.1 ? 0.55 : 1;
      envelope += (targetEnv - envelope) * (targetEnv > envelope ? 0.08 : 0.012);
      const highPassed = sample - previous * 0.985;
      previous = sample;
      target[index] = (sample * 0.82 + highPassed * 0.18) * envelope;
    }
  }

  return output;
}
