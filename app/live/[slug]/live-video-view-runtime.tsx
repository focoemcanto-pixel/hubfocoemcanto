'use client';

import { useEffect, useState } from 'react';
import { Maximize2, Move, Scan, X } from 'lucide-react';

type ViewSettings = { fit: 'cover' | 'contain'; zoom: number; x: number; y: number };
const STORAGE_KEY = 'foco-live-video-view';
const DEFAULTS: ViewSettings = { fit: 'cover', zoom: 100, x: 50, y: 50 };
const TRIGGER_CLASS = 'fl-advanced-video-trigger';

export default function LiveVideoViewRuntime() {
  const [isHost, setIsHost] = useState(false);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ViewSettings>(DEFAULTS);

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setSettings({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch {}
    const openPanel = () => setOpen(true);
    window.addEventListener('foco-video-view-open', openPanel);
    return () => window.removeEventListener('foco-video-view-open', openPanel);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
    window.dispatchEvent(new Event('foco-video-view-changed'));
  }, [settings]);

  useEffect(() => {
    if (!isHost) return;
    const sync = () => {
      const list = document.querySelector<HTMLElement>('.fl-tools-popover.panel-camera .fl-tools-list');
      if (!list || list.querySelector(`.${TRIGGER_CLASS}`)) return;
      const sectionLabel = document.createElement('small');
      sectionLabel.className = 'fl-device-section-label';
      sectionLabel.textContent = 'ENQUADRAMENTO';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${TRIGGER_CLASS} device-option`;
      button.innerHTML = '<span class="fl-advanced-video-icon">⌗</span><div><b>Enquadramento avançado</b><small>Fit, Fill, zoom e posição</small></div><i>›</i>';
      button.addEventListener('click', () => setOpen(true));
      list.append(sectionLabel, button);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, [isHost]);

  if (!isHost || !open) return null;

  return <div className="fl-video-view-backdrop" onPointerDown={() => setOpen(false)}>
    <section className="fl-video-view-modal" onPointerDown={(event) => event.stopPropagation()}>
      <header><div><small>FOCO LIVE</small><strong>Enquadramento da câmera</strong></div><button onClick={() => setOpen(false)}><X/></button></header>
      <div className="fl-video-fit-options">
        <button className={settings.fit === 'cover' ? 'active' : ''} onClick={() => setSettings((current) => ({ ...current, fit: 'cover' }))}><Maximize2/><b>Preencher</b><small>Ocupa todo o quadro</small></button>
        <button className={settings.fit === 'contain' ? 'active' : ''} onClick={() => setSettings((current) => ({ ...current, fit: 'contain' }))}><Scan/><b>Encaixar</b><small>Mostra a imagem inteira</small></button>
      </div>
      <label><span><b>Zoom</b><i>{settings.zoom}%</i></span><input type="range" min="100" max="200" value={settings.zoom} onChange={(event) => setSettings((current) => ({ ...current, zoom: Number(event.target.value) }))}/></label>
      <label><span><b>Posição horizontal</b><i>{settings.x}%</i></span><input type="range" min="0" max="100" value={settings.x} onChange={(event) => setSettings((current) => ({ ...current, x: Number(event.target.value) }))}/></label>
      <label><span><b>Posição vertical</b><i>{settings.y}%</i></span><input type="range" min="0" max="100" value={settings.y} onChange={(event) => setSettings((current) => ({ ...current, y: Number(event.target.value) }))}/></label>
      <div className="fl-video-view-hint"><Move/><span>Esses ajustes alteram apenas sua visualização local no estúdio.</span></div>
      <button className="reset" onClick={() => setSettings(DEFAULTS)}>Restaurar enquadramento</button>
    </section>
  </div>;
}
