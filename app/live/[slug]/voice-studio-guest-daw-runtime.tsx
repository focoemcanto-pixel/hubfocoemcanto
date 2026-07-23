'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import VoiceStudioDaw from './voice-studio-daw';

const CSS = `
.fl-room:not(.host-studio).vs-broadcast-viewer .fl-studio-scene.app-voice .vs-manager-shell{display:none!important}
.vs-guest-daw-direct{position:absolute;inset:0;min-width:0;min-height:0;overflow:hidden;background:#0b0e14}
.vs-guest-daw-direct .vs-daw{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.vs-guest-daw-direct .vs-transport,
.vs-guest-daw-direct .vs-options,
.vs-guest-daw-direct .vs-add-wrap,
.vs-guest-daw-direct .vs-selection-info,
.vs-guest-daw-direct .vs-fit-tools,
.vs-guest-daw-direct .vs-track-heads,
.vs-guest-daw-direct .vs-track-input-strip{display:none!important}
.vs-guest-daw-direct .vs-editor{height:100%!important;min-height:0!important;flex:1 1 auto!important;display:block!important;overflow:hidden!important;pointer-events:none!important}
.vs-guest-daw-direct .vs-timeline{width:100%!important;height:100%!important;min-width:0!important;overflow:hidden!important}
.vs-guest-daw-direct .vs-timeline-content,
.vs-guest-daw-direct .vs-pro-canvas,
.vs-guest-daw-direct .vs-pro-canvas-content{width:100%!important;min-width:100%!important;max-width:100%!important;min-height:100%!important}
.vs-guest-daw-direct .vs-pro-canvas-content{transform-origin:top left}
.vs-guest-daw-direct .vs-ruler{width:100%!important;min-width:100%!important}
@media(max-width:700px){
  .vs-guest-daw-direct .vs-pro-canvas-content{font-size:11px}
  .vs-guest-daw-direct .vs-ruler{height:42px!important}
}
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
