'use client';

import { useEffect } from 'react';

export default function VoiceStudioAddTrackRuntime() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.vs-track-menu button');
      if (!button || button.disabled) return;

      const kind = button.querySelector('b')?.textContent?.includes('MIDI') ? 'midi' : 'audio';
      window.setTimeout(() => {
        const record = document.querySelector<HTMLButtonElement>('.vs-main-controls button:nth-child(2)');
        if (!record || record.disabled) return;

        document.querySelector('.vs-add-track-toast')?.remove();
        const toast = document.createElement('div');
        toast.className = 'vs-add-track-toast';
        toast.textContent = kind === 'midi'
          ? 'Faixa MIDI preparada. Iniciando contagem…'
          : 'Faixa de voz preparada. Iniciando contagem…';
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 2200);
        record.click();
      }, 120);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
