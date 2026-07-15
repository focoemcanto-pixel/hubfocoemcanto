'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Music2, Mic2 } from 'lucide-react';

type AudioMode = 'speech' | 'music';

export default function MusicModeRuntime() {
  const [mode, setMode] = useState<AudioMode>('speech');
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('foco-live-audio-mode');
    if (saved === 'music') setMode('music');
    const timer = window.setInterval(() => {
      const controls = document.querySelector<HTMLElement>('.fl-controls');
      if (controls && controls !== mount) setMount(controls);
    }, 400);
    return () => window.clearInterval(timer);
  }, [mount]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const call = (window as any).__focoLiveCall;
      if (!call || !(window as any).__focoAudioModePending) return;
      (window as any).__focoAudioModePending = false;
      await applyMode(mode, call);
    }, 500);
    return () => window.clearInterval(timer);
  }, [mode]);

  async function applyMode(next: AudioMode, call = (window as any).__focoLiveCall) {
    if (!call) {
      (window as any).__focoAudioModePending = true;
      setMode(next);
      return;
    }
    setBusy(true);
    try {
      if (typeof call.updateInputSettings === 'function') {
        await call.updateInputSettings({ audio: { processor: { type: next === 'music' ? 'none' : 'noise-cancellation' } } });
      } else if (typeof call.setInputSettingsAsync === 'function') {
        await call.setInputSettingsAsync({ audio: { processor: { type: next === 'music' ? 'none' : 'noise-cancellation' } } });
      } else {
        setSupported(false);
      }
      document.documentElement.dataset.audioMode = next;
      window.localStorage.setItem('foco-live-audio-mode', next);
      setMode(next);
    } catch {
      setSupported(false);
    } finally {
      setBusy(false);
    }
  }

  if (!mount) return null;

  return createPortal(
    <div className="fl-audio-mode" aria-label="Perfil de áudio">
      <button className={mode === 'speech' ? 'active' : ''} disabled={busy} onClick={() => applyMode('speech')} title="Otimizado para conversa">
        <Mic2 size={16} /><span>Fala</span>
      </button>
      <button className={mode === 'music' ? 'active music' : ''} disabled={busy} onClick={() => applyMode('music')} title="Preserva canto e instrumentos">
        <Music2 size={16} /><span>Modo música</span>
      </button>
      {!supported && <small>Processamento padrão mantido</small>}
    </div>,
    mount,
  );
}
