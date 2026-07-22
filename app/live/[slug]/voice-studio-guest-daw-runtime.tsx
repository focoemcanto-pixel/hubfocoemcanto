'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VoiceStudioDaw from './voice-studio-daw';

const CSS = `
.fl-room:not(.host-studio).vs-broadcast-viewer .fl-studio-scene.app-voice .vs-manager-shell{display:none!important}
.vs-guest-daw-direct{position:absolute;inset:0;min-width:0;min-height:0;overflow:hidden;background:#0b0e14}
.vs-guest-daw-direct .vs-daw{height:100%;min-height:0;display:flex;flex-direction:column}
.vs-guest-daw-direct .vs-transport,
.vs-guest-daw-direct .vs-options,
.vs-guest-daw-direct .vs-add-wrap,
.vs-guest-daw-direct .vs-selection-info,
.vs-guest-daw-direct .vs-fit-tools,
.vs-guest-daw-direct .vs-track-heads article > div,
.vs-guest-daw-direct .vs-track-heads article > label,
.vs-guest-daw-direct .vs-track-input-strip{display:none!important}
.vs-guest-daw-direct .vs-editor{height:100%!important;min-height:100%!important;flex:1 1 auto!important;pointer-events:none!important}
.vs-guest-daw-direct .vs-track-heads article input{pointer-events:none!important;border:0!important;background:transparent!important;color:#fff!important}
.vs-guest-daw-direct .vs-pro-canvas{min-height:100%!important}
`;

export default function VoiceStudioGuestDawRuntime() {
  const [target, setTarget] = useState<Element | null>(null);
  const [guest, setGuest] = useState(false);

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
    <div className="vs-guest-daw-direct" aria-label="Apresentação do Voice Studio">
      <VoiceStudioDaw readOnly />
    </div>
  </>, target);
}
