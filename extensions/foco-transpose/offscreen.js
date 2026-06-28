let audioContext = null;
let stream = null;
let source = null;
let graph = null;
let semitones = 0;

function cleanupGraph() {
  if (graph?.cleanup) graph.cleanup();
  graph = null;
  if (source) {
    try { source.disconnect(); } catch {}
  }
  source = null;
}

function stop() {
  cleanupGraph();
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  if (audioContext) audioContext.close();
  audioContext = null;
  return { ok: true, message: 'Transposição desligada.' };
}

function createPassthrough(ctx, input) {
  const output = ctx.createGain();
  output.gain.value = 0.96;
  input.connect(output);
  output.connect(ctx.destination);
  return { cleanup: () => { try { input.disconnect(); output.disconnect(); } catch {} } };
}

function createDelayPitch(ctx, input, steps) {
  const ratio = Math.pow(2, steps / 12);
  if (Math.abs(steps) < 0.01 || Math.abs(ratio - 1) < 0.001) return createPassthrough(ctx, input);

  const output = ctx.createGain();
  output.gain.value = 0.9;
  const maxDelay = 0.08;
  const minDelay = 0.008;
  const crossfade = 0.03;
  const period = Math.min(0.38, Math.max(0.085, maxDelay / Math.abs(ratio - 1)));
  const now = ctx.currentTime + 0.04;
  const delayA = ctx.createDelay(maxDelay + 0.03);
  const delayB = ctx.createDelay(maxDelay + 0.03);
  const gainA = ctx.createGain();
  const gainB = ctx.createGain();

  input.connect(delayA);
  input.connect(delayB);
  delayA.connect(gainA);
  delayB.connect(gainB);
  gainA.connect(output);
  gainB.connect(output);
  output.connect(ctx.destination);

  function schedule(delay, gain, offset) {
    for (let i = 0; i < 120; i += 1) {
      const t = now + offset + i * period;
      const end = t + period;
      delay.delayTime.setValueAtTime(ratio > 1 ? maxDelay : minDelay, t);
      delay.delayTime.linearRampToValueAtTime(ratio > 1 ? minDelay : maxDelay, end);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + crossfade);
      gain.gain.setValueAtTime(1, Math.max(t + crossfade, end - crossfade));
      gain.gain.linearRampToValueAtTime(0, end);
    }
  }

  schedule(delayA, gainA, 0);
  schedule(delayB, gainB, period / 2);

  return {
    cleanup: () => {
      try {
        input.disconnect(); delayA.disconnect(); delayB.disconnect(); gainA.disconnect(); gainB.disconnect(); output.disconnect();
      } catch {}
    },
  };
}

function rebuild() {
  if (!audioContext || !stream) return;
  cleanupGraph();
  source = audioContext.createMediaStreamSource(stream);
  graph = createDelayPitch(audioContext, source, semitones);
}

async function start(streamId, steps) {
  stop();
  semitones = Number(steps || 0);
  audioContext = new AudioContext({ latencyHint: 'interactive' });
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });
  rebuild();
  return { ok: true, message: 'Captura da guia ativa. Use subir/descer para ajustar.' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'OFFSCREEN_START') return start(message.streamId, message.semitones);
    if (message.type === 'OFFSCREEN_STOP') return stop();
    if (message.type === 'OFFSCREEN_SET_TRANSPOSE') {
      semitones = Number(message.semitones || 0);
      rebuild();
      return { ok: true, message: `Transposição: ${semitones > 0 ? '+' : ''}${semitones}` };
    }
    return { ok: false, message: 'Comando offscreen desconhecido.' };
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message || 'Erro no processador de áudio.' }));
  return true;
});
