'use client';

import { useEffect, useRef, useState } from 'react';

type Mode = 'passthrough' | 'transpose' | 'monitor';
type PitchGraph = { cleanup: () => void };
type DisplayAudioOptions = MediaTrackConstraints & { suppressLocalAudioPlayback?: boolean };

function createPassthroughGraph(audioContext: AudioContext, source: MediaStreamAudioSourceNode): PitchGraph {
  const output = audioContext.createGain();
  output.gain.value = 0.95;
  source.connect(output);
  output.connect(audioContext.destination);
  return { cleanup: () => { source.disconnect(); output.disconnect(); } };
}

function createSilentMonitorGraph(audioContext: AudioContext, source: MediaStreamAudioSourceNode): PitchGraph {
  const analyser = audioContext.createAnalyser();
  source.connect(analyser);
  return { cleanup: () => { source.disconnect(); analyser.disconnect(); } };
}

function createDelayPitchGraph(audioContext: AudioContext, source: MediaStreamAudioSourceNode, semitones: number): PitchGraph {
  const output = audioContext.createGain();
  output.gain.value = 0.9;
  const ratio = Math.pow(2, semitones / 12);
  if (Math.abs(semitones) < 0.01 || Math.abs(ratio - 1) < 0.001) return createPassthroughGraph(audioContext, source);

  const maxDelay = 0.08;
  const minDelay = 0.008;
  const crossfade = 0.03;
  const period = Math.min(0.38, Math.max(0.085, maxDelay / Math.abs(ratio - 1)));
  const now = audioContext.currentTime + 0.04;
  const delayA = audioContext.createDelay(maxDelay + 0.03);
  const delayB = audioContext.createDelay(maxDelay + 0.03);
  const gainA = audioContext.createGain();
  const gainB = audioContext.createGain();

  source.connect(delayA); source.connect(delayB);
  delayA.connect(gainA); delayB.connect(gainB);
  gainA.connect(output); gainB.connect(output);
  output.connect(audioContext.destination);

  const scheduleRamp = (delay: DelayNode, gain: GainNode, offset: number) => {
    for (let i = 0; i < 90; i += 1) {
      const t = now + offset + i * period;
      const end = t + period;
      delay.delayTime.setValueAtTime(ratio > 1 ? maxDelay : minDelay, t);
      delay.delayTime.linearRampToValueAtTime(ratio > 1 ? minDelay : maxDelay, end);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + crossfade);
      gain.gain.setValueAtTime(1, Math.max(t + crossfade, end - crossfade));
      gain.gain.linearRampToValueAtTime(0, end);
    }
  };

  scheduleRamp(delayA, gainA, 0);
  scheduleRamp(delayB, gainB, period / 2);
  return { cleanup: () => { source.disconnect(); delayA.disconnect(); delayB.disconnect(); gainA.disconnect(); gainB.disconnect(); output.disconnect(); } };
}

export function AudioTransposePanel({ semitones }: { semitones: number }) {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<Mode>('passthrough');
  const [status, setStatus] = useState('');
  const [diagnostic, setDiagnostic] = useState('Aguardando teste.');
  const [supported, setSupported] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const graphRef = useRef<PitchGraph | null>(null);

  function stopCapture(message = 'Captura desligada.') {
    graphRef.current?.cleanup();
    graphRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setActive(false);
    setStatus(message);
  }

  function rebuildGraph(nextMode = mode, nextSemitones = semitones) {
    const stream = streamRef.current;
    const context = contextRef.current;
    if (!stream || !context) return;
    graphRef.current?.cleanup();
    const source = context.createMediaStreamSource(stream);
    graphRef.current = nextMode === 'monitor' ? createSilentMonitorGraph(context, source) : nextMode === 'passthrough' ? createPassthroughGraph(context, source) : createDelayPitchGraph(context, source, nextSemitones);
  }

  useEffect(() => { if (active) rebuildGraph(mode, semitones); }, [semitones, mode, active]);
  useEffect(() => () => stopCapture(''), []);

  async function startCapture(nextMode: Mode) {
    setMode(nextMode);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setSupported(false);
      setStatus('Este navegador não suporta captura de áudio da guia. Teste no Chrome desktop.');
      return;
    }

    try {
      if (active) stopCapture('Reiniciando captura...');
      setStatus('Na janela que abrir, escolha esta guia e marque compartilhar áudio.');
      const shouldMuteOriginal = nextMode === 'transpose';
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: shouldMuteOriginal } as DisplayAudioOptions,
      });

      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      setDiagnostic(`Áudio: ${audioTracks.length} faixa(s). Vídeo: ${videoTracks.length} faixa(s). Mudo original: ${shouldMuteOriginal ? 'sim' : 'não'}.`);

      if (!audioTracks.length) {
        stream.getTracks().forEach((track) => track.stop());
        setStatus('Nenhum áudio chegou ao Hub. Refaça escolhendo “Esta guia” e ativando “Compartilhar áudio da guia”.');
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
      rebuildGraph(nextMode, semitones);
      audioTracks[0].addEventListener('ended', () => stopCapture('A captura foi encerrada pelo navegador.'));
      setActive(true);
      setStatus(nextMode === 'monitor' ? 'Monitor ativo: o áudio original deve continuar tocando normal.' : nextMode === 'passthrough' ? 'Teste ativo: você pode ouvir áudio duplicado/eco. Isso confirma que a captura voltou para a página.' : 'Transposição ativa: se o original mutar, o som processado deve sair pela página.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível ativar a captura de áudio.');
    }
  }

  return <div className="audio-transpose-panel">
    <style dangerouslySetInnerHTML={{ __html: `.audio-transpose-panel{display:grid;gap:12px;border:1px solid rgba(38,224,196,.22);border-radius:22px;background:linear-gradient(145deg,rgba(38,224,196,.08),rgba(255,255,255,.035));padding:16px;margin-top:12px}.audio-transpose-panel strong{display:block;color:#fff;font-size:18px;margin:3px 0}.audio-transpose-panel span,.audio-transpose-panel small{display:block;color:#c8ccd5;line-height:1.45}.audio-transpose-actions{display:flex;gap:10px;flex-wrap:wrap}.audio-transpose-actions button{border:0;border-radius:999px;background:#26e0c4;color:#06100f;padding:11px 15px;font-weight:950;cursor:pointer}.audio-transpose-actions button:nth-child(3){background:#f5c76b}.audio-transpose-actions button:disabled{opacity:.55;cursor:not-allowed}.audio-transpose-diagnostic{border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(0,0,0,.18);padding:10px}` }} />
    <div><p className="eyebrow">Laboratório de áudio</p><strong>{active ? `Captura ativa: ${mode}` : 'Testar áudio da guia'}</strong><span>Comece pelo “Monitor sem mutar”. Depois teste captura e transpose.</span></div>
    <div className="audio-transpose-actions">
      <button type="button" onClick={() => startCapture('monitor')} disabled={!supported}>Monitor sem mutar</button>
      <button type="button" onClick={() => startCapture('passthrough')} disabled={!supported}>Teste com retorno</button>
      <button type="button" onClick={() => startCapture('transpose')} disabled={!supported}>Testar transpose</button>
      {active ? <button type="button" onClick={() => stopCapture()}>Desligar</button> : null}
    </div>
    <small className="audio-transpose-diagnostic">{diagnostic}</small>
    {status ? <small>{status}</small> : null}
  </div>;
}
