'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { VoiceStudioAsset } from './voice-studio-project-model';
import { buildRecordedAudioAsset, createAudioCapture, type VoiceStudioAudioCapture, type VoiceStudioRecordingSession } from './voice-studio-recording-engine';

const MIN_CLIP = 0.08;

type UseVoiceStudioAudioRecordingOptions = {
  readonly getAudioContext: () => AudioContext;
  readonly monitorInput: boolean;
  readonly startAtRef: RefObject<number>;
  readonly recordStartRef: RefObject<number>;
  readonly recordingSessionRef: RefObject<VoiceStudioRecordingSession | null>;
  readonly audioTrackCount: number;
  readonly onBeginClock: () => void;
  readonly onCleanupTransport: () => void;
  readonly onAddRecordedAsset: (asset: VoiceStudioAsset, blob: Blob | undefined, name: string, session: VoiceStudioRecordingSession) => void;
  readonly onElapsedChange: (elapsed: number) => void;
  readonly onLivePeaksChange: (peaks: number[]) => void;
  readonly onMeterChange: (meter: number) => void;
  readonly onStatusIdle: () => void;
};

export type VoiceStudioAudioRecording = {
  readonly prepare: () => Promise<void>;
  readonly begin: () => void;
  readonly stop: () => void;
  readonly cancel: () => void;
  readonly cleanup: () => void;
  readonly resetLivePeaks: () => void;
};

function makePeaks(data: Float32Array, count = 180) {
  const step = Math.max(1, Math.floor(data.length / count));
  return Array.from({ length: count }, (_, index) => {
    let max = 0;
    for (let cursor = index * step; cursor < Math.min(data.length, (index + 1) * step); cursor += 1) max = Math.max(max, Math.abs(data[cursor]));
    return Math.max(0.03, max);
  });
}

function typingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}

export function useVoiceStudioAudioRecording({ getAudioContext, monitorInput, startAtRef, recordStartRef, recordingSessionRef, audioTrackCount, onBeginClock, onCleanupTransport, onAddRecordedAsset, onElapsedChange, onLivePeaksChange, onMeterChange, onStatusIdle }: UseVoiceStudioAudioRecordingOptions): VoiceStudioAudioRecording {
  const captureRef = useRef<VoiceStudioAudioCapture | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const preparePromiseRef = useRef<Promise<void> | null>(null);
  const rafRef = useRef<number | null>(null);
  const livePeaksRef = useRef<number[]>([]);

  function resetLivePeaks() {
    livePeaksRef.current = [];
    onLivePeaksChange([]);
  }

  function syncMonitor() {
    const source = inputSourceRef.current;
    if (!source) return;
    if (!monitorInput) {
      try { monitorGainRef.current?.disconnect(); } catch {}
      monitorGainRef.current = null;
      return;
    }
    if (monitorGainRef.current) return;
    const context = getAudioContext();
    const gain = context.createGain();
    gain.gain.value = 0.75;
    source.connect(gain).connect(context.destination);
    monitorGainRef.current = gain;
  }

  async function prepare() {
    if (streamRef.current?.active && analyserRef.current) {
      syncMonitor();
      return;
    }
    if (preparePromiseRef.current) return preparePromiseRef.current;
    const pending = (async () => {
      const deviceId = localStorage.getItem('foco-live-microphone-device');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      const context = getAudioContext();
      await context.resume().catch(() => undefined);
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      inputSourceRef.current = source;
      analyserRef.current = analyser;
      syncMonitor();
      watchInput();
    })();
    preparePromiseRef.current = pending;
    try {
      await pending;
    } finally {
      preparePromiseRef.current = null;
    }
  }

  function begin() {
    const stream = streamRef.current;
    if (!stream) return;
    const capture = createAudioCapture(stream);
    captureRef.current = capture;
    recorderRef.current = capture.recorder;
    chunksRef.current = capture.chunks;
    capture.recorder.onstop = () => { void finish(capture); };
    capture.recorder.start(100);
    onBeginClock();
  }

  function watchInput() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      if (analyserRef.current !== analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      let max = 0;
      for (const value of data) {
        const normalized = Math.abs((value - 128) / 128);
        sum += normalized * normalized;
        max = Math.max(max, normalized);
      }
      onMeterChange(Math.min(1, Math.sqrt(sum / data.length) * 3));
      if (recorderRef.current?.state === 'recording') {
        livePeaksRef.current.push(Math.max(0.03, max));
        if (livePeaksRef.current.length > 220) livePeaksRef.current.shift();
        onLivePeaksChange([...livePeaksRef.current]);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
  }

  function cleanup() {
    onCleanupTransport();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { inputSourceRef.current?.disconnect(); } catch {}
    try { monitorGainRef.current?.disconnect(); } catch {}
    inputSourceRef.current = null;
    monitorGainRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    captureRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    preparePromiseRef.current = null;
    onMeterChange(0);
  }

  function restartPreview() {
    window.setTimeout(() => { void prepare().catch(() => undefined); }, 0);
  }

  function stop() {
    if (recorderRef.current?.state !== 'recording') return;
    try { recorderRef.current.requestData(); } catch {}
    recorderRef.current.stop();
  }

  function cancel() {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.onstop = null;
    try { if (recorder?.state === 'recording') recorder.stop(); } catch {}
    chunksRef.current = [];
    cleanup();
    resetLivePeaks();
    restartPreview();
  }

  async function finish(capture: VoiceStudioAudioCapture) {
    const session = recordingSessionRef.current;
    if (!session) {
      cleanup();
      onStatusIdle();
      restartPreview();
      return;
    }
    const clipDuration = Math.max(MIN_CLIP, (performance.now() - startAtRef.current) / 1000);
    const blob = new Blob(capture.chunks, { type: capture.recorder.mimeType || capture.mimeType || 'audio/webm' });
    let peaks = livePeaksRef.current;
    try {
      const context = new AudioContext();
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      peaks = makePeaks(buffer.getChannelData(0));
      await context.close().catch(() => undefined);
    } catch {}
    const asset = buildRecordedAudioAsset({ blob, duration: clipDuration, peaks, fileName: `voz-${Date.now()}.webm` });
    onAddRecordedAsset(asset, blob, `Voz ${audioTrackCount + 1}`, session);
    recordingSessionRef.current = null;
    cleanup();
    onElapsedChange(recordStartRef.current);
    onStatusIdle();
    restartPreview();
  }

  useEffect(() => {
    void prepare().catch(() => undefined);
  }, []);

  useEffect(() => {
    syncMonitor();
  }, [monitorInput]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || typingTarget(event.target)) return;
      if (recorderRef.current?.state !== 'recording') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stop();
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, []);

  useEffect(() => {
    const doubleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const trackHeads = target.closest<HTMLElement>('.vs-track-heads');
      if (!trackHeads || target.closest('article,.vs-add-wrap,button,input,label')) return;
      const existingAudioButton = trackHeads.querySelector<HTMLButtonElement>('.vs-track-menu button:not(:disabled)');
      if (existingAudioButton) {
        event.preventDefault();
        existingAudioButton.click();
        return;
      }
      const addButton = trackHeads.querySelector<HTMLButtonElement>('.vs-add:not(:disabled)');
      if (!addButton) return;
      event.preventDefault();
      addButton.click();
      window.setTimeout(() => {
        trackHeads.querySelector<HTMLButtonElement>('.vs-track-menu button:not(:disabled)')?.click();
      }, 0);
    };
    document.addEventListener('dblclick', doubleClick, true);
    return () => document.removeEventListener('dblclick', doubleClick, true);
  }, []);

  return { prepare, begin, stop, cancel, cleanup, resetLivePeaks };
}
