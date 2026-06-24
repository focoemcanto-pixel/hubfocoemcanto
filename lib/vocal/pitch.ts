export function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  const size = buffer.length;
  let rms = 0;

  for (let i = 0; i < size; i += 1) {
    rms += buffer[i] * buffer[i];
  }

  rms = Math.sqrt(rms / size);
  if (rms < 0.012) return { frequency: null, clarity: 0, volume: rms };

  let bestOffset = -1;
  let bestCorrelation = 0;
  let previousCorrelation = 1;
  const correlations = new Array<number>(size).fill(0);
  const minOffset = Math.floor(sampleRate / 1100);
  const maxOffset = Math.floor(sampleRate / 55);

  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < size - offset; i += 1) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation = 1 - correlation / (size - offset);
    correlations[offset] = correlation;

    if (correlation > 0.82 && correlation > previousCorrelation && correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
    previousCorrelation = correlation;
  }

  if (bestOffset === -1 || bestCorrelation < 0.82) return { frequency: null, clarity: bestCorrelation, volume: rms };

  const shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset];
  const refinedOffset = bestOffset + (Number.isFinite(shift) ? shift / 8 : 0);
  return {
    frequency: sampleRate / refinedOffset,
    clarity: bestCorrelation,
    volume: rms,
  };
}

export function getStableMidi(samples: number[], minimumSamples = 8) {
  if (samples.length < minimumSamples) return null;
  const recent = samples.slice(-18);
  const average = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const variance = recent.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / recent.length;
  const deviation = Math.sqrt(variance);
  if (deviation > 0.55) return null;
  return Math.round(average);
}
