'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { VoiceStudioAsset } from './voice-studio-project-model';
import { buildRecordedAudioAsset, createAudioCapture, type VoiceStudioAudioCapture, type VoiceStudioRecordingSession } from './voice-studio-recording-engine';

const MIN_CLIP = 0.08;
const DEVICE_STORAGE_KEY = 'foco-live-microphone-device';
const TRACK_INPUT_STYLE_ID = 'voice-studio-track-input-style';

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

function audioTrackArticles() {
  return Array.from(document.querySelectorAll<HTMLElement>('.vs-track-heads article')).filter(article => !article.querySelector(':scope > span svg'));
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
  const devicesRef = useRef<MediaDeviceInfo[]>([]);
  const selectedDeviceIdRef = useRef('');
  const meterRef = useRef(0);
  const uiObserverRef = useRef<MutationObserver | null>(null);

  function resetLivePeaks() {
    livePeaksRef.current = [];
    onLivePeaksChange([]);
  }

  function installTrackInputStyle() {
    if (document.getElementById(TRACK_INPUT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TRACK_INPUT_STYLE_ID;
    style.textContent = `.vs-track-input-strip{grid-column:1/-1;display:grid;grid-template-columns:74px 1fr;align-items:center;gap:7px;margin:5px 8px 0;padding-top:5px;border-top:1px solid rgba(148,163,184,.15)}.vs-track-input-strip select{min-width:0;width:100%;height:22px;border:1px solid #343946;border-radius:5px;background:#11151d;color:#cbd5e1;font-size:10px;padding:0 5px}.vs-track-input-strip select:disabled{opacity:.55}.vs-track-meter{position:relative;height:7px;border-radius:999px;background:#202632;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(148,163,184,.12)}.vs-track-meter b{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#22c55e 0%,#84cc16 72%,#f59e0b 90%,#ef4444 100%);transition:width 55ms linear}.vs-track-input-strip:not(.active) .vs-track-meter b{width:0!important}.vs-track-input-label{font-size:9px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
    document.head.appendChild(style);
  }

  function deviceLabel(device: MediaDeviceInfo, index: number) {
    return device.label || `Entrada ${index + 1}`;
  }

  function populateSelect(select: HTMLSelectElement) {
    const current = selectedDeviceIdRef.current;
    const signature = devicesRef.current.map(device => `${device.deviceId}:${device.label}`).join('|');
    if (select.dataset.devices === signature && select.value === current) return;
    select.dataset.devices = signature;
    select.replaceChildren();
    if (!devicesRef.current.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Entrada padrão';
      select.appendChild(option);
    } else {
      devicesRef.current.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = deviceLabel(device, index);
        select.appendChild(option);
      });
    }
    select.value = current || devicesRef.current[0]?.deviceId || '';
  }

  function paintTrackMeters() {
    const width = `${Math.round(Math.min(1, meterRef.current) * 100)}%`;
    audioTrackArticles().forEach(article => {
      const strip = article.querySelector<HTMLElement>('.vs-track-input-strip');
      const fill = article.querySelector<HTMLElement>('.vs-track-meter b');
      const armed = article.classList.contains('armed-track');
      strip?.classList.toggle('active', armed);
      if (fill) fill.style.width = armed ? width : '0%';
    });
  }

  function syncTrackInputUi() {
    installTrackInputStyle();
    audioTrackArticles().forEach(article => {
      let strip = article.querySelector<HTMLElement>('.vs-track-input-strip');
      if (!strip) {
        strip = document.createElement('div');
        strip.className = 'vs-track-input-strip';
        const label = document.createElement('span');
        label.className = 'vs-track-input-label';
        label.textContent = 'Entrada';
        const select = document.createElement('select');
        select.title = 'Selecionar microfone ou interface desta faixa';
        select.addEventListener('pointerdown', event => event.stopPropagation());
        select.addEventListener('click', event => event.stopPropagation());
        select.addEventListener('change', event => {
          event.stopPropagation();
          const next = select.value;
          selectedDeviceIdRef.current = next;
          localStorage.setItem(DEVICE_STORAGE_KEY, next);
          if (!article.classList.contains('armed-track')) {
            const armButton = article.querySelector<HTMLButtonElement>('button[title="Armar track"]');
            armButton?.click();
          }
          void restartInputPreview(next);
        });
        const meter = document.createElement('i');
        meter.className = 'vs-track-meter';
        meter.title = 'Nível de entrada ao vivo';
        meter.appendChild(document.createElement('b'));
        strip.append(label, select, meter);
        article.appendChild(strip);
      }
      const select = strip.querySelector<HTMLSelectElement>('select');
      if (select) {
        populateSelect(select);
        select.disabled = recorderRef.current?.state === 'recording';
      }
    });
    paintTrackMeters();
  }

  async function refreshAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
    devicesRef.current = devices;
    const saved = localStorage.getItem(DEVICE_STORAGE_KEY) || '';
    const stillAvailable = devices.some(device => device.deviceId === saved);
    selectedDeviceIdRef.current = stillAvailable ? saved : devices[0]?.deviceId || '';
    if (selectedDeviceIdRef.current) localStorage.setItem(DEVICE_STORAGE_KEY, selectedDeviceIdRef.current);
    syncTrackInputUi();
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

  function releaseInputPreview() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { inputSourceRef.current?.disconnect(); } catch {}
    try { monitorGainRef.current?.disconnect(); } catch {}
    inputSourceRef.current = null;
    monitorGainRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    preparePromiseRef.current = null;
    meterRef.current = 0;
    onMeterChange(0);
    paintTrackMeters();
  }

  async function prepare() {
    if (streamRef.current?.active && analyserRef.current) {
      syncMonitor();
      syncTrackInputUi();
      return;
    }
    if (preparePromiseRef.current) return preparePromiseRef.current;
    const pending = (async () => {
      const saved = selectedDeviceIdRef.current || localStorage.getItem(DEVICE_STORAGE_KEY) || '';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: saved ? { exact: saved } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      const actualDevice = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (actualDevice) {
        selectedDeviceIdRef.current = actualDevice;
        localStorage.setItem(DEVICE_STORAGE_KEY, actualDevice);
      }
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
      await refreshAudioDevices();
    })();
    preparePromiseRef.current = pending;
    try {
      await pending;
    } finally {
      preparePromiseRef.current = null;
    }
  }

  async function restartInputPreview(deviceId: string) {
    if (recorderRef.current?.state === 'recording') return;
    selectedDeviceIdRef.current = deviceId;
    releaseInputPreview();
    await prepare().catch(() => undefined);
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
    syncTrackInputUi();
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
      const nextMeter = Math.min(1, Math.sqrt(sum / data.length) * 3);
      meterRef.current = nextMeter;
      onMeterChange(nextMeter);
      paintTrackMeters();
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
    releaseInputPreview();
    captureRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
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
    installTrackInputStyle();
    const observer = new MutationObserver(() => syncTrackInputUi());
    const root = document.querySelector('.vs-track-heads') || document.body;
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    uiObserverRef.current = observer;
    const deviceChange = () => { void refreshAudioDevices(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', deviceChange);
    void prepare().catch(() => undefined);
    syncTrackInputUi();
    return () => {
      observer.disconnect();
      uiObserverRef.current = null;
      navigator.mediaDevices?.removeEventListener?.('devicechange', deviceChange);
      document.querySelectorAll('.vs-track-input-strip').forEach(node => node.remove());
      document.getElementById(TRACK_INPUT_STYLE_ID)?.remove();
    };
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
      if (!trackHeads || target.closest('article,.vs-add-wrap,button,input,label,select')) return;
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
