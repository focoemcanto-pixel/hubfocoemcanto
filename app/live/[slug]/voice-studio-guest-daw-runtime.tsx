'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const VISUAL_EVENT = 'foco-voice-studio-visual-snapshot';

type VisualSnapshot = {
  html: string;
  width: number;
  height: number;
  sequence: number;
};

const CSS = `
.fl-room:not(.host-studio).vs-broadcast-viewer .fl-studio-scene.app-voice .vs-manager-shell{display:none!important}
.vs-guest-daw-direct{position:absolute;inset:0;min-width:0;min-height:0;overflow:hidden;background:#0b0e14}
.vs-guest-daw-toolbar{position:absolute;z-index:80;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:6px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(15,18,25,.94);box-shadow:0 8px 24px rgba(0,0,0,.32)}
.vs-guest-daw-toolbar button{height:32px;min-width:34px;padding:0 10px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#202530;color:#fff;font-size:11px;font-weight:800}
.vs-guest-daw-toolbar button.active{background:#6d36e8;border-color:#9c78ff}
.vs-guest-daw-viewport{position:absolute;inset:0;overflow:auto;padding-top:56px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}
.vs-guest-daw-stage{position:relative;transform-origin:top left;pointer-events:none;background:#0b0e14}
.vs-guest-daw-stage *{pointer-events:none!important}
.vs-guest-daw-empty{height:100%;display:grid;place-items:center;padding:24px;color:#b9bfcc;text-align:center;font-size:13px}
`;

export default function VoiceStudioGuestDawRuntime() {
  const [target, setTarget] = useState<Element | null>(null);
  const [guest, setGuest] = useState(false);
  const [mode, setMode] = useState<'mobile' | 'desktop'>('mobile');
  const [zoom, setZoom] = useState(1);
  const [snapshot, setSnapshot] = useState<VisualSnapshot | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const receive = (event: Event) => {
      const incoming = (event as CustomEvent<VisualSnapshot>).detail;
      if (!incoming?.html) return;
      setSnapshot(current => !current || incoming.sequence >= current.sequence ? incoming : current);
    };
    window.addEventListener(VISUAL_EVENT, receive);
    return () => window.removeEventListener(VISUAL_EVENT, receive);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => setViewportWidth(viewport.clientWidth);
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    return () => observer.disconnect();
  }, [target]);

  const fitScale = useMemo(() => {
    if (!snapshot || !viewportWidth) return 1;
    return Math.min(1, viewportWidth / Math.max(1, snapshot.width));
  }, [snapshot, viewportWidth]);

  const scale = mode === 'mobile' ? fitScale * zoom : zoom;

  if (!guest || !target) return null;
  return createPortal(<>
    <style>{CSS}</style>
    <div className={`vs-guest-daw-direct ${mode}`} aria-label="Apresentação do Voice Studio">
      <div className="vs-guest-daw-toolbar">
        <button className={mode === 'mobile' ? 'active' : ''} onClick={() => { setMode('mobile'); setZoom(1); }}>Ajustar</button>
        <button className={mode === 'desktop' ? 'active' : ''} onClick={() => { setMode('desktop'); setZoom(.65); }}>Desktop</button>
        <button onClick={() => setZoom(value => Math.max(.3, Number((value - .1).toFixed(2))))}>−</button>
        <button onClick={() => setZoom(value => Math.min(2, Number((value + .1).toFixed(2))))}>+</button>
      </div>
      <div ref={viewportRef} className="vs-guest-daw-viewport">
        {snapshot ? <div
          className="vs-guest-daw-stage"
          style={{
            width: snapshot.width,
            height: snapshot.height,
            transform: `scale(${scale})`,
          }}
          dangerouslySetInnerHTML={{ __html: snapshot.html }}
        /> : <div className="vs-guest-daw-empty">Aguardando a apresentação do Voice Studio…</div>}
      </div>
    </div>
  </>, target);
}
