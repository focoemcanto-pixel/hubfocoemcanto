'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, KeyboardMusic, Mic2, Settings2, SlidersHorizontal, Video } from 'lucide-react';

type Panel = 'apps' | 'mic' | 'camera' | null;

type DeviceSummary = {
  microphones: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
};

export default function LiveToolsRuntime() {
  const [roomReady, setRoomReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [devices, setDevices] = useState<DeviceSummary>({ microphones: [], cameras: [] });
  const [audioProfile, setAudioProfile] = useState<'speech' | 'music'>(() => 'speech');
  const controls = roomReady ? document.querySelector('.fl-controls') : null;
  const micButton = roomReady ? document.querySelector('.fl-controls > button:nth-child(1)') : null;
  const cameraButton = roomReady ? document.querySelector('.fl-controls > button:nth-child(2)') : null;
  const offersPanel = roomReady ? document.querySelector('.fl-director-offers') : null;

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    setAudioProfile(window.localStorage.getItem('foco-live-audio-mode') === 'music' ? 'music' : 'speech');
    const sync = () => setRoomReady(Boolean(document.querySelector('.fl-room')));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!roomReady || !navigator.mediaDevices?.enumerateDevices) return;
    const load = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          microphones: list.filter((device) => device.kind === 'audioinput'),
          cameras: list.filter((device) => device.kind === 'videoinput'),
        });
      } catch {
        setDevices({ microphones: [], cameras: [] });
      }
    };
    void load();
    navigator.mediaDevices.addEventListener?.('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', load);
  }, [roomReady]);

  useEffect(() => {
    if (!panel) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.fl-tools-popover') && !target.closest('.fl-control-chevron') && !target.closest('.fl-apps-trigger')) setPanel(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [panel]);

  const title = useMemo(() => panel === 'apps' ? 'Apps' : panel === 'mic' ? 'Microfone' : 'Câmera', [panel]);

  async function setProfile(profile: 'speech' | 'music') {
    setAudioProfile(profile);
    window.localStorage.setItem('foco-live-audio-mode', profile);
    const call = (window as any).__FOCO_LIVE_CALL__;
    try {
      const settings = { audio: { processor: { type: profile === 'music' ? 'none' : 'noise-cancellation' } } };
      if (typeof call?.updateInputSettings === 'function') await call.updateInputSettings(settings);
      else if (typeof call?.setInputSettingsAsync === 'function') await call.setInputSettingsAsync(settings);
    } catch {}
  }

  if (!roomReady) return null;

  return <>
    {micButton && createPortal(<span className="fl-control-chevron" role="button" tabIndex={0} aria-label="Ajustes do microfone" onClick={(event) => { event.stopPropagation(); setPanel(panel === 'mic' ? null : 'mic'); }}><ChevronUp size={12} /></span>, micButton)}
    {cameraButton && createPortal(<span className="fl-control-chevron" role="button" tabIndex={0} aria-label="Ajustes da câmera" onClick={(event) => { event.stopPropagation(); setPanel(panel === 'camera' ? null : 'camera'); }}><ChevronUp size={12} /></span>, cameraButton)}
    {controls && createPortal(<button type="button" className={`fl-apps-trigger${panel === 'apps' ? ' active' : ''}`} onClick={() => setPanel(panel === 'apps' ? null : 'apps')}><SlidersHorizontal /><span>Apps</span></button>, controls)}

    {panel && <section className={`fl-tools-popover panel-${panel}`}>
      <header><div><small>FOCO LIVE</small><strong>{title}</strong></div><button onClick={() => setPanel(null)}>×</button></header>
      {panel === 'apps' && <div className="fl-tools-list">
        {isHost && <button onClick={() => { window.dispatchEvent(new Event('foco-piano-toggle')); setPanel(null); }}><KeyboardMusic /><div><b>Foco Keys</b><small>Piano sincronizado da aula</small></div><i>›</i></button>}
        {!isHost && <div className="fl-tools-info"><KeyboardMusic /><div><b>Foco Keys</b><small>O piano aparece automaticamente quando o professor abrir.</small></div></div>}
        <button disabled><Settings2 /><div><b>Afinador</b><small>Em breve</small></div></button>
        <button disabled><SlidersHorizontal /><div><b>Timer</b><small>Em breve</small></div></button>
      </div>}
      {panel === 'mic' && <div className="fl-tools-list">
        <div className="fl-device-card"><Mic2 /><div><small>DISPOSITIVO ATUAL</small><b>{devices.microphones[0]?.label || 'Microfone padrão do navegador'}</b></div></div>
        <button className={audioProfile === 'speech' ? 'selected' : ''} onClick={() => setProfile('speech')}><Mic2 /><div><b>Perfil voz</b><small>Cancelamento de ruído ativo</small></div></button>
        <button className={audioProfile === 'music' ? 'selected' : ''} onClick={() => setProfile('music')}><SlidersHorizontal /><div><b>Perfil música</b><small>Preserva dinâmica e harmônicos</small></div></button>
      </div>}
      {panel === 'camera' && <div className="fl-tools-list">
        <div className="fl-device-card"><Video /><div><small>DISPOSITIVO ATUAL</small><b>{devices.cameras[0]?.label || 'Câmera padrão do navegador'}</b></div></div>
        {devices.cameras.length > 1 && <p className="fl-tools-hint">{devices.cameras.length} câmeras detectadas. A troca de dispositivo continua disponível nas permissões do navegador.</p>}
      </div>}
    </section>}

    {offersPanel && createPortal(<OfferAccordion />, offersPanel)}
  </>;
}

function OfferAccordion() {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const panel = document.querySelector('.fl-director-offers');
    panel?.classList.toggle('fl-offers-expanded', expanded);
    return () => panel?.classList.remove('fl-offers-expanded');
  }, [expanded]);
  return <button type="button" className="fl-offers-toggle" onClick={() => setExpanded((current) => !current)}><span>Ofertas</span><small>{expanded ? 'Recolher opções' : 'Abrir biblioteca e CTAs'}</small><ChevronUp className={expanded ? '' : 'collapsed'} size={16} /></button>;
}
