'use client';

import { useEffect, useRef, useState } from 'react';

type PitchGraph = {
  input: MediaStreamAudioSourceNode;
  output: GainNode;
  cleanup: () => void;
};

function createDelayPitchGraph(audioContext: AudioContext, source: MediaStreamAudioSourceNode, semitones: number): PitchGraph {
  const output = audioContext.createGain();
  output.gain.value = 0.92;

  const ratio = Math.pow(2, semitones / 12);
  if (Math.abs(semitones) < 0.01 || Math.abs(ratio - 1) < 0.001) {
    source.connect(output);
    output.connect(audioContext.destination);
    return { input: source, output, cleanup: () => { source.disconnect(); output.disconnect(); } };
  }

  const maxDelay = 0.09;
  const minDelay = 0.005;
  const crossfade = 0.035;
  const period = Math.min(0.42, Math.max(0.075, maxDelay / Math.abs(ratio - 1)));
  const now = audioContext.currentTime + 0.03;

  const delayA = audioContext.createDelay(maxDelay + 0.03);
  const delayB = audioContext.createDelay(maxDelay + 0.03);
  const gainA = audioContext.createGain();
  const gainB = audioContext.createGain();

  source.connect(delayA);
  source.connect(delayB);
  delayA.connect(gainA);
  delayB.connect(gainB);
  gainA.connect(output);
  gainB.connect(output);
  output.connect(audioContext.destination);

  const scheduleRamp = (delay: DelayNode, gain: GainNode, start: number, offset: number) => {
    const first = start + offset;
    for (let i = 0; i < 70; i += 1) {
      const t = first + i * period;
      const end = t + period;
      delay.delayTime.cancelScheduledValues(t);
      delay.delayTime.setValueAtTime(ratio > 1 ? maxDelay : minDelay, t);
      delay.delayTime.linearRampToValueAtTime(ratio > 1 ? minDelay : maxDelay, end);

      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + crossfade);
      gain.gain.setValueAtTime(1, Math.max(t + crossfade, end - crossfade));
      gain.gain.linearRampToValueAtTime(0, end);
    }
  };

  scheduleRamp(delayA, gainA, now, 0);
  scheduleRamp(delayB, gainB, now, period / 2);

  return {
    input: source,
    output,
    cleanup: () => {
      source.disconnect();
      delayA.disconnect();
      delayB.disconnect();
      gainA.disconnect();
      gainB.disconnect();
      output.disconnect();
    },
  };
}

export function AudioTransposePanel({ semitones }: { semitones: number }) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('');
  const [supported, setSupported] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<PitchGraph | null>(null);

  function stopCapture() {
    graphRef.current?.cleanup();
    graphRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setActive(false);
    setStatus('Transposição de áudio desligada.');
  }

  function rebuildGraph(nextSemitones: number) {
    const stream = streamRef.current;
    const context = contextRef.current;
    if (!stream || !context) return;
    graphRef.current?.cleanup();
    const source = context.createMediaStreamSource(stream);
    graphRef.current = createDelayPitchGraph(context, source, nextSemitones);
  }

  useEffect(() => {
    if (!active) return;
    rebuildGraph(semitones);
  }, [semitones, active]);

  useEffect(() => () => stopCapture(), []);

  async function startCapture() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setSupported(false);
      setStatus('Este navegador não suporta captura de áudio da guia. Teste no Chrome desktop.');
      return;
    }

    try {
      setStatus('Escolha esta guia e marque compartilhar áudio.');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // Chrome tenta silenciar o áudio local capturado para evitar som duplicado/retorno.
          suppressLocalAudioPlayback: true,
        } as MediaTrackConstraints,
      });

      const audioTracks = stream.getAudioTracks();
      stream.getVideoTracks().forEach((track) => track.stop());

      if (!audioTracks.length) {
        stream.getTracks().forEach((track) => track.stop());
        setStatus('Nenhum áudio foi compartilhado. Ative “Compartilhar áudio da guia” e tente novamente.');
        return;
      }

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        stream.getTracks().forEach((track) => track.stop());
        setStatus('AudioContext não disponível neste navegador.');
        return;
      }

      const context = new AudioContextClass({ latencyHint: 'interactive' });
      streamRef.current = stream;
      contextRef.current = context;
      rebuildGraph(semitones);
      audioTracks[0].addEventListener('ended', stopCapture);
      setActive(true);
      setStatus('Áudio capturado. Use subir/descer tom para ouvir o teste.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível ativar a captura de áudio.');
    }
  }

  return <div className="audio-transpose-panel">
    <div>
      <p className="eyebrow">Áudio transposto experimental</p>
      <strong>{active ? 'Transposição real ativa' : 'Ativar teste de áudio'}</strong>
      <span>Funciona melhor no Chrome desktop. Ao permitir, escolha esta guia e compartilhe o áudio.</span>
    </div>
    <div className="audio-transpose-actions">
      {active ? <button type="button" onClick={stopCapture}>Desligar áudio</button> : <button type="button" onClick={startCapture} disabled={!supported}>Ativar áudio transposto</button>}
    </div>
    {status ? <small>{status}</small> : null}
  </div>;
}
