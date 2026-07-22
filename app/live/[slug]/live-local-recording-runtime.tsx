'use client';

import { useEffect } from 'react';

const CSS = `
.fl-recording-button.local-recording{background:#b91c1c!important;border-color:#ef4444!important;color:#fff!important;box-shadow:0 0 0 3px rgba(239,68,68,.18)}
.fl-local-recording-hint{position:fixed;left:50%;top:86px;z-index:20000;transform:translateX(-50%);max-width:min(620px,calc(100vw - 28px));padding:11px 15px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:#171a22;color:#fff;font-size:12px;font-weight:750;box-shadow:0 14px 38px rgba(0,0,0,.45)}
`;

function bestMimeType() {
  const choices = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return choices.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function fileStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export default function LiveLocalRecordingRuntime() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('host') !== '1') return;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let busy = false;
    let hint: HTMLDivElement | null = null;

    const button = () => document.querySelector<HTMLButtonElement>('.fl-recording-button');

    const showHint = (message: string, timeout = 6000) => {
      hint?.remove();
      hint = document.createElement('div');
      hint.className = 'fl-local-recording-hint';
      hint.textContent = message;
      document.body.appendChild(hint);
      if (timeout) window.setTimeout(() => { hint?.remove(); hint = null; }, timeout);
    };

    const paint = (active: boolean) => {
      const target = button();
      if (!target) return;
      target.classList.toggle('local-recording', active);
      target.classList.toggle('recording', active);
      target.disabled = busy;
      target.innerHTML = active ? '<span aria-hidden="true">●</span> Gravando localmente' : '<span aria-hidden="true">○</span> Gravar';
      target.title = active ? 'Clique para parar e baixar a gravação' : 'Gravar a transmissão nesta máquina';
    };

    const download = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `foco-live-${fileStamp()}.webm`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    };

    const stop = () => {
      if (!recorder || recorder.state === 'inactive') return;
      busy = true;
      paint(true);
      try { recorder.requestData(); } catch {}
      recorder.stop();
    };

    const start = async () => {
      if (busy || recorder?.state === 'recording') return;
      busy = true;
      paint(false);
      try {
        showHint('Selecione “Esta guia” e ative “Compartilhar áudio da guia”. A gravação será baixada ao parar.', 9000);
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 30 } },
          audio: true,
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          surfaceSwitching: 'include',
          systemAudio: 'include',
        } as DisplayMediaStreamOptions);
        const mimeType = bestMimeType();
        recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_500_000, audioBitsPerSecond: 192_000 } : undefined);
        chunks = [];
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => showHint('A gravação encontrou um erro. Tente novamente.', 7000);
        recorder.onstop = () => {
          const type = recorder?.mimeType || 'video/webm';
          const blob = new Blob(chunks, { type });
          stream?.getTracks().forEach(track => track.stop());
          stream = null;
          recorder = null;
          chunks = [];
          busy = false;
          paint(false);
          if (blob.size > 1024) {
            download(blob);
            showHint('Gravação finalizada e baixada para este computador.', 7000);
          } else showHint('A gravação ficou vazia. Selecione a guia atual e compartilhe o áudio ao tentar novamente.', 8000);
        };
        stream.getVideoTracks()[0]?.addEventListener('ended', stop, { once: true });
        recorder.start(1000);
        busy = false;
        paint(true);
        showHint('Gravação local iniciada. Mantenha esta guia aberta e clique em “Gravando localmente” para finalizar.', 7000);
      } catch (error) {
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        recorder = null;
        busy = false;
        paint(false);
        showHint(error instanceof Error && error.name === 'NotAllowedError' ? 'A captura foi cancelada. Clique em Gravar e selecione a guia atual.' : 'Não foi possível iniciar a gravação local.', 8000);
      }
    };

    const click = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.fl-recording-button');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (recorder?.state === 'recording') stop(); else void start();
    };

    document.addEventListener('click', click, true);
    const timer = window.setInterval(() => paint(recorder?.state === 'recording'), 500);
    paint(false);

    return () => {
      document.removeEventListener('click', click, true);
      window.clearInterval(timer);
      try { if (recorder?.state === 'recording') recorder.stop(); } catch {}
      stream?.getTracks().forEach(track => track.stop());
      hint?.remove();
      style.remove();
    };
  }, []);

  return null;
}
