'use client';

import { useEffect } from 'react';
import DailyIframe from '@daily-co/daily-js';

async function closeActiveCall() {
  const call = (DailyIframe as any).getCallInstance?.();

  try { await call?.stopScreenShare?.(); } catch {}
  try { await call?.setLocalAudio?.(false); } catch {}
  try { await call?.setLocalVideo?.(false); } catch {}
  try { await call?.leave?.(); } catch {}
  try { await call?.destroy?.(); } catch {}

  document.querySelectorAll<HTMLVideoElement | HTMLAudioElement>('video, audio').forEach((element) => {
    const stream = element.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    element.srcObject = null;
  });
}

export default function EndCleanupRuntime() {
  useEffect(() => {
    let cleanupTimer = 0;

    const handleClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest('button');
      const label = button?.textContent?.trim() || '';
      if (!/Encerrar transmissão|Encerrar e sair/i.test(label)) return;

      window.clearTimeout(cleanupTimer);
      // Dá tempo para a API registrar o encerramento e enviar live-ended aos convidados.
      cleanupTimer = window.setTimeout(() => { void closeActiveCall(); }, 900);
    };

    const handlePageExit = () => { void closeActiveCall(); };

    document.addEventListener('click', handleClick, true);
    window.addEventListener('pagehide', handlePageExit);

    return () => {
      window.clearTimeout(cleanupTimer);
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('pagehide', handlePageExit);
    };
  }, []);

  return null;
}
