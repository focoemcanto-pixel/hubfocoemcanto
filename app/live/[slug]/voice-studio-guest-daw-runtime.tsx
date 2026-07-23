'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VoiceStudioDaw from './voice-studio-daw';

const CSS = `
.fl-room:not(.host-studio).vs-broadcast-viewer .fl-studio-scene.app-voice .vs-manager-shell{display:none!important}
.vs-guest-daw-direct{position:absolute;inset:0;min-width:0;min-height:0;overflow:hidden;background:#0b0e14}
.vs-guest-daw-toolbar{position:absolute;z-index:50;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:6px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(15,18,25,.92);box-shadow:0 8px 24px rgba(0,0,0,.32)}
.vs-guest-daw-toolbar button{height:32px;min-width:34px;padding:0 10px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#202530;color:#fff;font-size:11px;font-weight:800}
.vs-guest-daw-toolbar button.active{background:#6d36e8;border-color:#9c78ff}
.vs-guest-daw-viewport{position:absolute;inset:0;overflow:auto;padding-top:56px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.vs-guest-daw-canvas{position:relative;height:100%;min-height:520px;transform-origin:top left}
.vs-guest-daw-direct.mobile .vs-guest-daw-canvas{width:100%;min-width:100%}
.vs-guest-daw-direct.desktop .vs-guest-daw-canvas{width:1180px;height:680px;min-width:1180px;min-height:680px}
.vs-guest-daw-canvas .vs-daw{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.vs-guest-daw-canvas .vs-transport,
.vs-guest-daw-canvas .vs-options,
.vs-guest-daw-canvas .vs-add-wrap,
.vs-guest-daw-canvas .vs-selection-info,
.vs-guest-daw-canvas .vs-fit-tools,
.vs-guest-daw-canvas .vs-track-input-strip{display:none!important}
.vs-guest-daw-direct.mobile .vs-track-heads{display:none!important}
.vs-guest-daw-canvas .vs-editor{height:100%!important;min-height:0!important;flex:1 1 auto!important;overflow:hidden!important;pointer-events:none!important}
.vs-guest-daw-canvas .vs-timeline{width:100%!important;height:100%!important;min-width:0!important;overflow:hidden!important}
.vs-guest-daw-direct.mobile .vs-timeline-content,
.vs-guest-daw-direct.mobile .vs-pro-canvas,
.vs-guest-daw-direct.mobile .vs-pro-canvas-content{width:100%!important;min-width:100%!important;max-width:100%!important;min-height:100%!important}
.vs-guest-daw-canvas .vs-pro-canvas-content{transform-origin:top left}
.vs-guest-daw-direct.mobile .vs-ruler{width:100%!important;min-width:100%!important}
@media(max-width:700px){.vs-guest-daw-direct.mobile .vs-pro-canvas-content{font-size:11px}.vs-guest-daw-direct.mobile .vs-ruler{height:42px!important}}
`;

export default function VoiceStudioGuestDawRuntime() {
  const [target, setTarget] = useState<Element | null>(null);
  const [guest, setGuest] = useState(false);
  const [mode, setMode] = useState<'mobile' | 'desktop'>('mobile');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setGuest(new URLSearchParams(window.location.search).get('host') !== '1');
    const sync = () => {
      const scene = document.querySelector('.fl-studio-scene.app-voice');
      setTarget(scene?.querySelector('.fl-studio-app-canvas') || null);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  if (!guest || !target) return null;
  return createPortal(<>
    <style>{CSS}</style>
    <div className={`vs-guest-daw-direct ${mode}`} aria-label="Apresentação do Voice Studio">
      <div className="vs-guest-daw-toolbar">
        <button className={mode === 'mobile' ? 'active' : ''} onClick={() => { setMode('mobile'); setZoom(1); }}>Celular</button>
        <button className={mode === 'desktop' ? 'active' : ''} onClick={() => { setMode('desktop'); setZoom(.55); }}>Desktop</button>
        <button onClick={() => setZoom(value => Math.max(.35, Number((value - .1).toFixed(2))))}>−</button>
        <button onClick={() => setZoom(value => Math.min(1.8, Number((value + .1).toFixed(2))))}>+</button>
      </div>
      <div className="vs-guest-daw-viewport">
        <div className="vs-guest-daw-canvas" style={{ transform: `scale(${zoom})` }}>
          <VoiceStudioDaw readOnly />
        </div>
      </div>
    </div>
  </>, target);
}
