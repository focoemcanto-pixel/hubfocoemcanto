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
    let previewAudioOn = true;
    let previewVideoOn = true;

    window.__focoPrejoin = window.__focoPrejoin || { audioEnabled: false, videoEnabled: false };

    function stopMeter() {
      window.cancelAnimationFrame(animationFrame);
      if (audioContext) void audioContext.close().catch(() => undefined);
      audioContext = null;
    }

    function stopPreview() {
      stopMeter();
      previewStream?.getTracks().forEach((track) => track.stop());
      previewStream = null;
      const video = mountedPanel?.querySelector<HTMLVideoElement>('[data-prejoin-video]');
      if (video) video.srcObject = null;
    }

    async function listDevices(panel: HTMLElement) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const micSelect = panel.querySelector<HTMLSelectElement>('[data-prejoin-mic]');
      const cameraSelect = panel.querySelector<HTMLSelectElement>('[data-prejoin-camera]');
      if (!micSelect || !cameraSelect) return;
      const currentMic = window.__focoPrejoin?.audioDeviceId;
      const currentCamera = window.__focoPrejoin?.videoDeviceId;
      const microphones = devices.filter((device) => device.kind === 'audioinput');
      const cameras = devices.filter((device) => device.kind === 'videoinput');
      micSelect.innerHTML = microphones.length
        ? microphones.map((device, index) => `<option value="${device.deviceId}">${device.label || `Microfone ${index + 1}`}</option>`).join('')
        : '<option value="">Microfone padrão</option>';
      cameraSelect.innerHTML = cameras.length
        ? cameras.map((device, index) => `<option value="${device.deviceId}">${device.label || `Câmera ${index + 1}`}</option>`).join('')
        : '<option value="">Câmera padrão</option>';
      if (currentMic) micSelect.value = currentMic;
      if (currentCamera) cameraSelect.value = currentCamera;
    }

    function syncPreviewControls(panel: HTMLElement) {
      panel.querySelector('[data-preview-mic-toggle]')?.classList.toggle('off', !previewAudioOn);
      panel.querySelector('[data-preview-camera-toggle]')?.classList.toggle('off', !previewVideoOn);
      const micLabel = panel.querySelector<HTMLElement>('[data-preview-mic-label]');
      const cameraLabel = panel.querySelector<HTMLElement>('[data-preview-camera-label]');
      if (micLabel) micLabel.textContent = previewAudioOn ? 'Microfone ativo' : 'Microfone desligado';
      if (cameraLabel) cameraLabel.textContent = previewVideoOn ? 'Câmera ativa' : 'Câmera desligada';
      previewStream?.getAudioTracks().forEach((track) => { track.enabled = previewAudioOn; });
      previewStream?.getVideoTracks().forEach((track) => { track.enabled = previewVideoOn; });
      panel.classList.toggle('camera-off', !previewVideoOn);
      panel.classList.toggle('mic-off', !previewAudioOn);
    }

    function startMeter(panel: HTMLElement, stream: MediaStream) {
      stopMeter();
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
        if (!previewAudioOn) meter.style.setProperty('--level', '0%');
        else {
          analyser.getByteFrequencyData(values);
          const average = values.reduce((sum, value) => sum + value, 0) / values.length;
          meter.style.setProperty('--level', `${Math.min(100, average * 1.7)}%`);
        }
        animationFrame = window.requestAnimationFrame(draw);
      };
      draw();
    }

    async function startPreview(panel: HTMLElement) {
      stopPreview();
      panel.classList.remove('permission-error');
      const status = panel.querySelector<HTMLElement>('[data-prejoin-status]');
      const video = panel.querySelector<HTMLVideoElement>('[data-prejoin-video]');
      const micSelect = panel.querySelector<HTMLSelectElement>('[data-prejoin-mic]');
      const cameraSelect = panel.querySelector<HTMLSelectElement>('[data-prejoin-camera]');
      const testButton = panel.querySelector<HTMLButtonElement>('[data-prejoin-test]');
      try {
        if (status) status.textContent = 'Aguardando sua autorização para câmera e microfone…';
        if (testButton) testButton.textContent = 'Abrindo prévia…';
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
        previewAudioOn = true;
        previewVideoOn = true;
        syncPreviewControls(panel);
        startMeter(panel, previewStream);
        panel.classList.add('ready');
        if (status) status.textContent = 'Prévia ativa — confirme sua imagem e o nível do microfone';
        if (testButton) testButton.textContent = 'Reiniciar teste';
      } catch (error) {
        panel.classList.remove('ready');
        panel.classList.add('permission-error');
        const denied = error instanceof DOMException && error.name === 'NotAllowedError';
        if (status) status.textContent = denied
          ? 'A câmera ou o microfone foram bloqueados. Clique em tentar novamente para autorizar.'
          : 'Não foi possível abrir a prévia. Tente novamente.';
        if (testButton) testButton.textContent = 'Tentar novamente';
      }
    }

    function mount() {
      const card = document.querySelector<HTMLElement>('.fl-entry-card');
      const form = card?.querySelector<HTMLFormElement>('form');
      if (!card || !form || card.querySelector('[data-prejoin-panel]')) return;
      const panel = document.createElement('section');
      panel.dataset.prejoinPanel = 'true';
      panel.className = 'fl-prejoin-panel';
      panel.innerHTML = `
        <div class="fl-prejoin-preview">
          <video data-prejoin-video muted playsinline></video>
          <div class="fl-prejoin-placeholder"><b>Prévia da câmera</b><span>Clique em ativar prévia para testar</span></div>
          <div class="fl-preview-controls">
            <button type="button" data-preview-mic-toggle class="off" aria-label="Ligar ou desligar microfone"><span>🎙️</span><small data-preview-mic-label>Microfone desligado</small></button>
            <button type="button" data-preview-camera-toggle class="off" aria-label="Ligar ou desligar câmera"><span>📷</span><small data-preview-camera-label>Câmera desligada</small></button>
          </div>
          <div class="fl-prejoin-meter"><i data-prejoin-meter></i></div>
        </div>
        <div class="fl-prejoin-tools">
          <div><strong>Configuração de áudio e vídeo</strong><small data-prejoin-status>Clique abaixo para ativar a prévia da câmera e do microfone</small></div>
          <label>Microfone<select data-prejoin-mic><option value="">Microfone padrão</option></select></label>
          <label>Câmera<select data-prejoin-camera><option value="">Câmera padrão</option></select></label>
          <div class="fl-prejoin-toggles">
            <label><input type="checkbox" data-prejoin-audio-toggle /> Entrar com microfone ligado</label>
            <label><input type="checkbox" data-prejoin-video-toggle /> Entrar com câmera ligada</label>
          </div>
          <button type="button" data-prejoin-test>Ativar prévia</button>
        </div>`;
      form.insertAdjacentElement('beforebegin', panel);
      mountedPanel = panel;
      panel.querySelector('[data-prejoin-test]')?.addEventListener('click', () => startPreview(panel));
      panel.querySelector('[data-preview-mic-toggle]')?.addEventListener('click', () => {
        if (!previewStream) return void startPreview(panel);
        previewAudioOn = !previewAudioOn;
        syncPreviewControls(panel);
      });
      panel.querySelector('[data-preview-camera-toggle]')?.addEventListener('click', () => {
        if (!previewStream) return void startPreview(panel);
        previewVideoOn = !previewVideoOn;
        syncPreviewControls(panel);
      });
      panel.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
        select.addEventListener('change', () => {
          if (select.matches('[data-prejoin-mic]')) window.__focoPrejoin!.audioDeviceId = select.value;
          if (select.matches('[data-prejoin-camera]')) window.__focoPrejoin!.videoDeviceId = select.value;
          if (previewStream) void startPreview(panel);
        });
      });
      panel.querySelector<HTMLInputElement>('[data-prejoin-audio-toggle]')?.addEventListener('change', (event) => {
        window.__focoPrejoin!.audioEnabled = (event.target as HTMLInputElement).checked;
      });
      panel.querySelector<HTMLInputElement>('[data-prejoin-video-toggle]')?.addEventListener('change', (event) => {
        window.__focoPrejoin!.videoEnabled = (event.target as HTMLInputElement).checked;
      });

      // Não intercepta o submit. Apenas libera os dispositivos no gesto anterior
      // ao clique, deixando o fluxo React/Daily completamente intacto.
      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
      submitButton?.addEventListener('pointerdown', stopPreview, { passive: true });
      submitButton?.addEventListener('touchstart', stopPreview, { passive: true });
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
