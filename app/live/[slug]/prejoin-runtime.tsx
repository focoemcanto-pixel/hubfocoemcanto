'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __focoLiveCall?: any;
    __focoPrejoin?: {
      audioDeviceId?: string;
      videoDeviceId?: string;
      audioEnabled: boolean;
      videoEnabled: boolean;
    };
  }
}

export default function PrejoinRuntime() {
  useEffect(() => {
    let previewStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let animationFrame = 0;
    let mountedPanel: HTMLElement | null = null;

    window.__focoPrejoin = window.__focoPrejoin || {
      audioEnabled: false,
      videoEnabled: false,
    };

    function stopPreview() {
      window.cancelAnimationFrame(animationFrame);
      previewStream?.getTracks().forEach((track) => track.stop());
      previewStream = null;
      audioContext?.close().catch(() => undefined);
      audioContext = null;
    }

    async function listDevices(panel: HTMLElement) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const micSelect = panel.querySelector<HTMLSelectElement>('[data-prejoin-mic]');
      const cameraSelect = panel.querySelector<HTMLSelectElement>('[data-prejoin-camera]');
      if (!micSelect || !cameraSelect) return;

      const currentMic = window.__focoPrejoin?.audioDeviceId;
      const currentCamera = window.__focoPrejoin?.videoDeviceId;
      micSelect.innerHTML = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => `<option value="${device.deviceId}">${device.label || `Microfone ${index + 1}`}</option>`)
        .join('');
      cameraSelect.innerHTML = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => `<option value="${device.deviceId}">${device.label || `Câmera ${index + 1}`}</option>`)
        .join('');
      if (currentMic) micSelect.value = currentMic;
      if (currentCamera) cameraSelect.value = currentCamera;
    }

    function startMeter(panel: HTMLElement, stream: MediaStream) {
      const audioTrack = stream.getAudioTracks()[0];
      const meter = panel.querySelector<HTMLElement>('[data-prejoin-meter]');
      if (!audioTrack || !meter) return;
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(values);
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        meter.style.setProperty('--level', `${Math.min(100, average * 1.7)}%`);
        animationFrame = window.requestAnimationFrame(draw);
      };
      draw();
    }

    async function startPreview(panel: HTMLElement) {
      stopPreview();
      const status = panel.querySelector<HTMLElement>('[data-prejoin-status]');
      const video = panel.querySelector<HTMLVideoElement>('[data-prejoin-video]');
      const micSelect = panel.querySelector<HTMLSelectElement>('[data-prejoin-mic]');
      const cameraSelect = panel.querySelector<HTMLSelectElement>('[data-prejoin-camera]');
      try {
        if (status) status.textContent = 'Solicitando permissão…';
        previewStream = await navigator.mediaDevices.getUserMedia({
          audio: micSelect?.value ? { deviceId: { exact: micSelect.value } } : true,
          video: cameraSelect?.value ? { deviceId: { exact: cameraSelect.value } } : true,
        });
        if (video) {
          video.srcObject = previewStream;
          await video.play().catch(() => undefined);
        }
        await listDevices(panel);
        const audioDeviceId = previewStream.getAudioTracks()[0]?.getSettings().deviceId;
        const videoDeviceId = previewStream.getVideoTracks()[0]?.getSettings().deviceId;
        window.__focoPrejoin = {
          audioDeviceId,
          videoDeviceId,
          audioEnabled: panel.querySelector<HTMLInputElement>('[data-prejoin-audio-toggle]')?.checked ?? false,
          videoEnabled: panel.querySelector<HTMLInputElement>('[data-prejoin-video-toggle]')?.checked ?? false,
        };
        if (micSelect && audioDeviceId) micSelect.value = audioDeviceId;
        if (cameraSelect && videoDeviceId) cameraSelect.value = videoDeviceId;
        startMeter(panel, previewStream);
        panel.classList.add('ready');
        if (status) status.textContent = 'Câmera e microfone prontos';
      } catch {
        panel.classList.add('permission-error');
        if (status) status.textContent = 'Permissão negada. Libere câmera e microfone no navegador.';
      }
    }

    async function applyPreferencesToCall() {
      const call = window.__focoLiveCall;
      const preferences = window.__focoPrejoin;
      if (!call || !preferences) return;
      try {
        if (call.setInputDevicesAsync && (preferences.audioDeviceId || preferences.videoDeviceId)) {
          await call.setInputDevicesAsync({
            audioDeviceId: preferences.audioDeviceId,
            videoDeviceId: preferences.videoDeviceId,
          });
        }
        await call.setLocalAudio(Boolean(preferences.audioEnabled));
        await call.setLocalVideo(Boolean(preferences.videoEnabled));
      } catch {
        // A sala continuará usando os dispositivos padrão quando o navegador não permitir a troca.
      }
    }

    function mount() {
      const card = document.querySelector<HTMLElement>('.fl-entry-card');
      const form = card?.querySelector('form');
      if (!card || !form || card.querySelector('[data-prejoin-panel]')) return;

      const panel = document.createElement('section');
      panel.dataset.prejoinPanel = 'true';
      panel.className = 'fl-prejoin-panel';
      panel.innerHTML = `
        <div class="fl-prejoin-preview">
          <video data-prejoin-video muted playsinline></video>
          <div class="fl-prejoin-placeholder"><b>Prévia da câmera</b><span>Teste seus dispositivos antes de entrar</span></div>
          <div class="fl-prejoin-meter"><i data-prejoin-meter></i></div>
        </div>
        <div class="fl-prejoin-tools">
          <div><strong>Configuração de áudio e vídeo</strong><small data-prejoin-status>Clique em testar para conferir seus dispositivos</small></div>
          <label>Microfone<select data-prejoin-mic><option>Microfone padrão</option></select></label>
          <label>Câmera<select data-prejoin-camera><option>Câmera padrão</option></select></label>
          <div class="fl-prejoin-toggles">
            <label><input type="checkbox" data-prejoin-audio-toggle /> Entrar com microfone ligado</label>
            <label><input type="checkbox" data-prejoin-video-toggle /> Entrar com câmera ligada</label>
          </div>
          <button type="button" data-prejoin-test>Testar câmera e microfone</button>
        </div>`;
      form.insertAdjacentElement('beforebegin', panel);
      mountedPanel = panel;

      panel.querySelector('[data-prejoin-test]')?.addEventListener('click', () => startPreview(panel));
      panel.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
        select.addEventListener('change', () => {
          if (select.matches('[data-prejoin-mic]')) window.__focoPrejoin!.audioDeviceId = select.value;
          if (select.matches('[data-prejoin-camera]')) window.__focoPrejoin!.videoDeviceId = select.value;
          if (previewStream) startPreview(panel);
        });
      });
      panel.querySelector<HTMLInputElement>('[data-prejoin-audio-toggle]')?.addEventListener('change', (event) => {
        window.__focoPrejoin!.audioEnabled = (event.target as HTMLInputElement).checked;
      });
      panel.querySelector<HTMLInputElement>('[data-prejoin-video-toggle]')?.addEventListener('change', (event) => {
        window.__focoPrejoin!.videoEnabled = (event.target as HTMLInputElement).checked;
      });
      form.addEventListener('submit', () => {
        window.setTimeout(applyPreferencesToCall, 500);
        window.setTimeout(applyPreferencesToCall, 1400);
        stopPreview();
      });
    }

    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    mount();

    const deviceChange = () => mountedPanel && listDevices(mountedPanel).catch(() => undefined);
    navigator.mediaDevices?.addEventListener?.('devicechange', deviceChange);

    return () => {
      observer.disconnect();
      navigator.mediaDevices?.removeEventListener?.('devicechange', deviceChange);
      stopPreview();
      mountedPanel?.remove();
    };
  }, []);

  return null;
}
