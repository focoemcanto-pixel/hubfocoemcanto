'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { VoiceStudioAsset } from './voice-studio-project-model';
import { buildRecordedAudioAsset, createAudioCapture, type VoiceStudioAudioCapture, type VoiceStudioRecordingSession } from './voice-studio-recording-engine';

const MIN_CLIP = 0.08;
const DEVICE_STORAGE_KEY = 'foco-live-microphone-device';
const CHANNEL_STORAGE_KEY = 'foco-live-microphone-channel';
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
  const processedStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const channelGainRef = useRef<GainNode | null>(null);
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const preparePromiseRef = useRef<Promise<void> | null>(null);
  const rafRef = useRef<number | null>(null);
  const livePeaksRef = useRef<number[]>([]);
  const devicesRef = useRef<MediaDeviceInfo[]>([]);
  const selectedDeviceIdRef = useRef('');
  const selectedChannelRef = useRef(Math.max(0, Number(localStorage.getItem(CHANNEL_STORAGE_KEY) || 0)));
  const channelCountRef = useRef(1);
  const meterRef = useRef(0);

  function resetLivePeaks() {
    livePeaksRef.current = [];
    onLivePeaksChange([]);
  }

  function installTrackInputStyle() {
    if (document.getElementById(TRACK_INPUT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TRACK_INPUT_STYLE_ID;
    style.textContent = `.vs-track-input-strip{grid-column:1/-1;display:grid;grid-template-columns:58px minmax(0,1fr) 72px;align-items:center;gap:6px;margin:5px 8px 0;padding-top:5px;border-top:1px solid rgba(148,163,184,.15)}.vs-track-input-strip select{min-width:0;width:100%;height:22px;border:1px solid #343946;border-radius:5px;background:#11151d;color:#cbd5e1;font-size:9px;padding:0 4px}.vs-track-input-strip select:disabled{opacity:.55}.vs-track-meter{grid-column:2/-1;position:relative;height:7px;border-radius:999px;background:#202632;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(148,163,184,.12)}.vs-track-meter b{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#22c55e 0%,#84cc16 72%,#f59e0b 90%,#ef4444 100%);transition:width 55ms linear}.vs-track-input-strip:not(.active) .vs-track-meter b{width:0!important}.vs-track-input-label{font-size:9px;color:#94a3b8;white-space:nowrap}`;
    document.head.appendChild(style);
  }

  function deviceLabel(device: MediaDeviceInfo, index: number) {
    return device.label || `Entrada ${index + 1}`;
  }

  function populateDeviceSelect(select: HTMLSelectElement) {
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

  function populateChannelSelect(select: HTMLSelectElement) {
    const count = Math.max(1, channelCountRef.current);
    const signature = String(count);
    if (select.dataset.channels === signature && Number(select.value) === selectedChannelRef.current) return;
    select.dataset.channels = signature;
    select.replaceChildren();
    for (let index = 0; index < count; index += 1) {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `Canal ${index + 1}`;
      select.appendChild(option);
    }
    selectedChannelRef.current = Math.min(selectedChannelRef.current, count - 1);
    select.value = String(selectedChannelRef.current);
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

  function armArticle(article: HTMLElement) {
    if (article.classList.contains('armed-track')) return;
    article.querySelector<HTMLButtonElement>('button[title="Armar track"]')?.click();
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

        const deviceSelect = document.createElement('select');
        deviceSelect.className = 'vs-track-device-select';
        deviceSelect.title = 'Selecionar microfone ou interface';
        deviceSelect.addEventListener('pointerdown', event => event.stopPropagation());
        deviceSelect.addEventListener('click', event => event.stopPropagation());
        deviceSelect.addEventListener('change', event => {
          event.stopPropagation();
          selectedDeviceIdRef.current = deviceSelect.value;
          localStorage.setItem(DEVICE_STORAGE_KEY, deviceSelect.value);
          armArticle(article);
          void restartInputPreview(deviceSelect.value, selectedChannelRef.current);
        });

        const channelSelect = document.createElement('select');
        channelSelect.className = 'vs-track-channel-select';
        channelSelect.title = 'Selecionar canal físico da interface';
        channelSelect.addEventListener('pointerdown', event => event.stopPropagation());
        channelSelect.addEventListener('click', event => event.stopPropagation());
        channelSelect.addEventListener('change', event => {
          event.stopPropagation();
          selectedChannelRef.current = Math.max(0, Number(channelSelect.value));
          localStorage.setItem(CHANNEL_STORAGE_KEY, String(selectedChannelRef.current));
          armArticle(article);
          void restartInputPreview(selectedDeviceIdRef.current, selectedChannelRef.current);
        });

        const meter = document.createElement('i');
        meter.className = 'vs-track-meter';
        meter.title = 'Nível do canal selecionado';
        meter.appendChild(document.createElement('b'));
        strip.append(label, deviceSelect, channelSelect, meter);
        article.appendChild(strip);
      }
      const deviceSelect = strip.querySelector<HTMLSelectElement>('.vs-track-device-select');
      const channelSelect = strip.querySelector<HTMLSelectElement>('.vs-track-channel-select');
      if (deviceSelect) populateDeviceSelect(deviceSelect);
      if (channelSelect) populateChannelSelect(channelSelect);
      const disabled = recorderRef.current?.state === 'recording';
      if (deviceSelect) deviceSelect.disabled = disabled;
      if (channelSelect) channelSelect.disabled = disabled;
    });
    paintTrackMeters();
  }

  async function refreshAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    devicesRef.current = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
    const saved = localStorage.getItem(DEVICE_STORAGE_KEY) || '';
    const stillAvailable = devicesRef.current.some(device => device.deviceId === saved);
    selectedDeviceIdRef.current = stillAvailable ? saved : devicesRef.current[0]?.deviceId || '';
    if (selectedDeviceIdRef.current) localStorage.setItem(DEVICE_STORAGE_KEY, selectedDeviceIdRef.current);
    syncTrackInputUi();
  }

  function syncMonitor() {
    const channelGain = channelGainRef.current;
    if (!channelGain) return;
    if (!monitorInput) {
      try { monitorGainRef.current?.disconnect(); } catch {}
      monitorGainRef.current = null;
      return;
    }
    if (monitorGainRef.current) return;
    const context = getAudioContext();
    const gain = context.createGain();
    gain.gain.value = 0.75;
    channelGain.connect(gain).connect(context.destination);
    monitorGainRef.current = gain;
  }

  function releaseInputPreview() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { inputSourceRef.current?.disconnect(); } catch {}
    try { splitterRef.current?.disconnect(); } catch {}
    try { channelGainRef.current?.disconnect(); } catch {}
    try { analyserRef.current?.disconnect(); } catch {}
    try { recordingDestinationRef.current?.disconnect(); } catch {}
    try { monitorGainRef.current?.disconnect(); } catch {}
    inputSourceRef.current = null;
    splitterRef.current = null;
    channelGainRef.current = null;
    analyserRef.current = null;
    recordingDestinationRef.current = null;
    monitorGainRef.current = null;
    processedStreamRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    preparePromiseRef.current = null;
    meterRef.current = 0;
    onMeterChange(0);
    paintTrackMeters();
  }

  async function prepare() {
    if (streamRef.current?.active && analyserRef.current && processedStreamRef.current?.active) {
      syncMonitor();
      syncTrackInputUi();
      return;
    }
    if (preparePromiseRef.current) return preparePromiseRef.current;
    const pending = (async () => {
      const saved = selectedDeviceIdRef.current || localStorage.getItem(DEVICE_STORAGE_KEY) || '';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: saved ? { exact: saved } : undefined,
          channelCount: { ideal: 32 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings();
      const actualDevice = settings?.deviceId;
      if (actualDevice) {
        selectedDeviceIdRef.current = actualDevice;
        localStorage.setItem(DEVICE_STORAGE_KEY, actualDevice);
      }

      const context = getAudioContext();
      await context.resume().catch(() => undefined);
      const source = context.createMediaStreamSource(stream);
      const reportedChannels = Math.max(1, Number(settings?.channelCount || source.channelCount || 1));
      channelCountRef.current = reportedChannels;
      selectedChannelRef.current = Math.min(Math.max(0, selectedChannelRef.current), reportedChannels - 1);
      localStorage.setItem(CHANNEL_STORAGE_KEY, String(selectedChannelRef.current));

      const splitter = context.createChannelSplitter(reportedChannels);
      const channelGain = context.createGain();
      const analyser = context.createAnalyser();
      const destination = context.createMediaStreamDestination();
      analyser.fftSize = 512;

      source.connect(splitter);
      splitter.connect(channelGain, selectedChannelRef.current, 0);
      channelGain.connect(analyser);
      channelGain.connect(destination);

      inputSourceRef.current = source;
      splitterRef.current = splitter;
      channelGainRef.current = channelGain;
      analyserRef.current = analyser;
      recordingDestinationRef.current = destination;
      processedStreamRef.current = destination.stream;
      syncMonitor();
      watchInput();
      await refreshAudioDevices();
      syncTrackInputUi();
    })();
    preparePromiseRef.current = pending;
    try {
      await pending;
    } finally {
      preparePromiseRef.current = null;
    }
  }

  async function restartInputPreview(deviceId: string, channel: number) {
    if (recorderRef.current?.state === 'recording') return;
    selectedDeviceIdRef.current = deviceId;
    selectedChannelRef.current = Math.max(0, channel);
    releaseInputPreview();
    await prepare().catch(() => undefined);
  }

  function begin() {
    const stream = processedStreamRef.current;
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
    const deviceChange = () => { void refreshAudioDevices(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', deviceChange);
    void prepare().catch(() => undefined);
    syncTrackInputUi();
    return () => {
      observer.disconnect();
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
