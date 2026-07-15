'use client';

import { useEffect } from 'react';

export default function PrejoinRuntime() {
  useEffect(() => {
    let previewStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let animationFrame = 0;
    let mountedPanel: HTMLElement | null = null;
    let previewAudioOn = true;
    let previewVideoOn = true;

    function stopPreview() {
      window.cancelAnimationFrame(animationFrame);
      if (audioContext) void audioContext.close().catch(() => undefined);
      audioContext = null;
      previewStream?.getTracks().forEach((track) => track.stop());
      previewStream = null;
      const video = mountedPanel?.querySelector<HTMLVideoElement>('[data-prejoin-video]');
      if (video) video.srcObject = null;
    }

    async function listDevices(panel: HTMLElement) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mic = panel.querySelector<HTMLSelectElement>('[data-prejoin-mic]');
      const camera = panel.querySelector<HTMLSelectElement>('[data-prejoin-camera]');
      if (!mic || !camera) return;
      const microphones = devices.filter((device) => device.kind === 'audioinput');
      const cameras = devices.filter((device) => device.kind === 'videoinput');
      const selectedMic = mic.value;
      const selectedCamera = camera.value;
      mic.innerHTML = microphones.length
        ? microphones.map((device, index) => `<option value="${device.deviceId}">${device.label || `Microfone ${index + 1}`}</option>`).join('')
        : '<option value="">Microfone padrão</option>';
      camera.innerHTML = cameras.length
        ? cameras.map((device, index) => `<option value="${device.deviceId}">${device.label || `Câmera ${index + 1}`}</option>`).join('')
        : '<option value="">Câmera padrão</option>';
      if (selectedMic) mic.value = selectedMic;
      if (selectedCamera) camera.value = selectedCamera;
    }

    function syncControls(panel: HTMLElement) {
      previewStream?.getAudioTracks().forEach((track) => { track.enabled = previewAudioOn; });
      previewStream?.getVideoTracks().forEach((track) => { track.enabled = previewVideoOn; });
      panel.classList.toggle('camera-off', !previewVideoOn);
      panel.classList.toggle('mic-off', !previewAudioOn);
      const micLabel = panel.querySelector<HTMLElement>('[data-preview-mic-label]');
      const cameraLabel = panel.querySelector<HTMLElement>('[data-preview-camera-label]');
      if (micLabel) micLabel.textContent = previewAudioOn ? 'Microfone ativo' : 'Microfone desligado';
      if (cameraLabel) cameraLabel.textContent = previewVideoOn ? 'Câmera ativa' : 'Câmera desligada';
    }

    function startMeter(panel: HTMLElement, stream: MediaStream) {
      const track = stream.getAudioTracks()[0];
      const meter = panel.querySelector<HTMLElement>('[data-prejoin-meter]');
      if (!track || !meter) return;
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(values);
        const average = previewAudioOn ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        meter.style.setProperty('--level', `${Math.min(100, average * 1.7)}%`);
        animationFrame = window.requestAnimationFrame(draw);
      };
      draw();
    }

    async function startPreview(panel: HTMLElement) {
      stopPreview();
      const status = panel.querySelector<HTMLElement>('[data-prejoin-status]');
      const button = panel.querySelector<HTMLButtonElement>('[data-prejoin-test]');
      const video = panel.querySelector<HTMLVideoElement>('[data-prejoin-video]');
      const mic = panel.querySelector<HTMLSelectElement>('[data-prejoin-mic]');
      const camera = panel.querySelector<HTMLSelectElement>('[data-prejoin-camera]');
      try {
        if (status) status.textContent = 'Solicitando acesso à câmera e ao microfone…';
        if (button) button.textContent = 'Abrindo prévia…';
        previewStream = await navigator.mediaDevices.getUserMedia({
          audio: mic?.value ? { deviceId: { exact: mic.value } } : true,
          video: camera?.value ? { deviceId: { exact: camera.value } } : true,
        });
        if (video) {
          video.srcObject = previewStream;
          await video.play().catch(() => undefined);
        }
        await listDevices(panel);
        previewAudioOn = true;
        previewVideoOn = true;
        syncControls(panel);
        startMeter(panel, previewStream);
        panel.classList.add('ready');
        panel.classList.remove('permission-error');
        if (status) status.textContent = 'Prévia ativa — confirme sua imagem e o nível do microfone';
        if (button) button.textContent = 'Reiniciar teste';
      } catch (error) {
        panel.classList.remove('ready');
        panel.classList.add('permission-error');
        if (status) status.textContent = error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Permissão não concedida. Clique em tentar novamente.'
          : 'Não foi possível abrir a prévia. Tente novamente.';
        if (button) button.textContent = 'Tentar novamente';
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
            <button type="button" data-preview-mic-toggle class="off"><span>🎙️</span><small data-preview-mic-label>Microfone desligado</small></button>
            <button type="button" data-preview-camera-toggle class="off"><span>📷</span><small data-preview-camera-label>Câmera desligada</small></button>
          </div>
          <div class="fl-prejoin-meter"><i data-prejoin-meter></i></div>
        </div>
        <div class="fl-prejoin-tools">
          <div><strong>Configuração de áudio e vídeo</strong><small data-prejoin-status>Ative a prévia antes de entrar</small></div>
          <label>Microfone<select data-prejoin-mic><option value="">Microfone padrão</option></select></label>
          <label>Câmera<select data-prejoin-camera><option value="">Câmera padrão</option></select></label>
          <button type="button" data-prejoin-test>Ativar prévia</button>
        </div>`;
      form.insertAdjacentElement('beforebegin', panel);
      mountedPanel = panel;

      panel.querySelector('[data-prejoin-test]')?.addEventListener('click', () => void startPreview(panel));
      panel.querySelector('[data-preview-mic-toggle]')?.addEventListener('click', () => {
        if (!previewStream) return void startPreview(panel);
        previewAudioOn = !previewAudioOn;
        syncControls(panel);
      });
      panel.querySelector('[data-preview-camera-toggle]')?.addEventListener('click', () => {
        if (!previewStream) return void startPreview(panel);
        previewVideoOn = !previewVideoOn;
        syncControls(panel);
      });
      panel.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
        select.addEventListener('change', () => {
          if (previewStream) void startPreview(panel);
        });
      });
      form.addEventListener('submit', stopPreview);
    }

    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    mount();
    return () => {
      observer.disconnect();
      stopPreview();
      mountedPanel?.remove();
    };
  }, []);

  return null;
}
