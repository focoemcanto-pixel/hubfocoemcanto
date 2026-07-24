'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, Check, Expand, Grid2X2, Hand, LayoutPanelTop, Mic2, MoreVertical, PictureInPicture2, Settings2, SmilePlus, Sparkles, Video, X } from 'lucide-react';

type LiveWindow = Window & { __FOCO_LIVE_CALL__?: any };
type ReactionMessage = { type: 'foco-reaction'; emoji: string; name?: string; id?: string };
type FloatingReaction = { id: string; emoji: string; name: string; left: number };
type LayoutOption = 'Aula' | 'Grade' | 'Automático';

const REACTIONS = ['❤️','👍','👏','🎉','😂','😮','🤔','🔥','🎵'];

export default function LiveEngagementRuntime() {
  const [ready, setReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeLayout, setActiveLayout] = useState<LayoutOption>('Aula');
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const attachedCallRef = useRef<any>(null);

  const controls = ready ? document.querySelector<HTMLElement>('.fl-room .fl-controls') : null;
  const room = ready ? document.querySelector<HTMLElement>('.fl-room') : null;

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    const sync = () => {
      const currentControls = document.querySelector<HTMLElement>('.fl-room .fl-controls');
      setReady(Boolean(currentControls));
      if (!currentControls) return;
      Array.from(currentControls.children).forEach((child) => {
        const element = child as HTMLElement;
        const text = (element.textContent || '').trim();
        const moveToMore = element.classList.contains('fl-apps-trigger') || /^Apps$/i.test(text) || /^Direção$/i.test(text) || /^Direcao$/i.test(text);
        if (moveToMore) element.style.setProperty('display', 'none', 'important');
      });
      const active = Array.from(document.querySelectorAll<HTMLButtonElement>('.fl-native-layout-switcher button')).find((button) => button.classList.contains('active'));
      const label = active?.textContent?.trim();
      if (label === 'Aula' || label === 'Grade' || label === 'Automático') setActiveLayout(label);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const timer = window.setInterval(sync, 300);
    sync();
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.fl-reaction-button') && !target.closest('.fl-reaction-picker')) setReactionOpen(false);
      if (!target.closest('.fl-more-button') && !target.closest('.fl-more-menu') && !target.closest('.fl-live-settings-modal')) {
        setMoreOpen(false);
        setViewOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  useEffect(() => {
    let disposed = false;
    const onMessage = (event: any) => {
      const data = event?.data as ReactionMessage | undefined;
      if (data?.type !== 'foco-reaction' || !data.emoji) return;
      showReaction(data.emoji, data.name || 'Participante', data.id);
    };
    const bind = () => {
      const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
      if (!call || call === attachedCallRef.current) return;
      attachedCallRef.current?.off?.('app-message', onMessage);
      attachedCallRef.current = call;
      call.on?.('app-message', onMessage);
    };
    bind();
    const timer = window.setInterval(() => { if (!disposed) bind(); }, 500);
    return () => { disposed = true; window.clearInterval(timer); attachedCallRef.current?.off?.('app-message', onMessage); };
  }, []);

  function showReaction(emoji: string, name: string, fixedId?: string) {
    const id = fixedId || crypto.randomUUID();
    const left = 12 + Math.random() * 76;
    setFloating((current) => [...current, { id, emoji, name, left }]);
    window.setTimeout(() => setFloating((current) => current.filter((item) => item.id !== id)), 3200);
  }

  function react(emoji: string) {
    const call = (window as LiveWindow).__FOCO_LIVE_CALL__;
    const local = call?.participants?.()?.local;
    const name = local?.user_name || (isHost ? 'Professor' : 'Participante');
    const id = crypto.randomUUID();
    showReaction(emoji, name, id);
    call?.sendAppMessage?.({ type: 'foco-reaction', emoji, name, id }, '*');
    setReactionOpen(false);
  }

  function raiseHand() {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.fl-controls button')).find((item) => /mão|mao|hand/i.test(item.textContent || item.getAttribute('aria-label') || ''));
    button?.click();
    setReactionOpen(false);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await room?.requestFullscreen?.();
    } catch {}
    setMoreOpen(false);
  }

  async function openPiP() {
    try {
      const video = room?.querySelector<HTMLVideoElement>('.fl-stage-video-area video');
      const pipDocument = document as Document & { pictureInPictureElement?: Element | null; exitPictureInPicture?: () => Promise<void> };
      const pipVideo = video as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };
      if (!video) return;
      if (pipDocument.pictureInPictureElement && pipDocument.exitPictureInPicture) await pipDocument.exitPictureInPicture();
      else if (pipVideo.requestPictureInPicture) await pipVideo.requestPictureInPicture();
    } catch {}
    setMoreOpen(false);
  }

  function openDevicePanel(kind: 'mic' | 'camera') {
    const index = kind === 'mic' ? 1 : 2;
    document.querySelector<HTMLElement>(`.fl-controls > button:nth-child(${index}) .fl-control-chevron`)?.click();
    setSettingsOpen(false);
    setMoreOpen(false);
  }

  function openApps() {
    document.querySelector<HTMLButtonElement>('.fl-apps-trigger')?.click();
    setMoreOpen(false);
  }

  function openDirection() {
    Array.from(document.querySelectorAll<HTMLButtonElement>('.fl-controls button')).find((item) => /direção|direcao/i.test(item.textContent || ''))?.click();
    setMoreOpen(false);
  }

  function setLayout(label: LayoutOption) {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.fl-native-layout-switcher button')).find((item) => item.textContent?.trim() === label);
    button?.click();
    setActiveLayout(label);
    setViewOpen(false);
    setMoreOpen(false);
  }

  if (!ready || !controls || !room) return null;

  return <>
    {createPortal(<button type="button" className={`fl-reaction-button${reactionOpen ? ' active' : ''}`} onClick={(event) => { event.stopPropagation(); setReactionOpen((value) => !value); setMoreOpen(false); setViewOpen(false); }}><SmilePlus/><span>Reagir</span></button>, controls, 'foco-reaction-button')}
    {createPortal(<button type="button" className={`fl-more-button${moreOpen ? ' active' : ''}`} onClick={(event) => { event.stopPropagation(); setMoreOpen((value) => !value); setReactionOpen(false); setViewOpen(false); }}><MoreVertical/><span>Mais</span></button>, controls, 'foco-more-button')}

    {reactionOpen && createPortal(<section className="fl-reaction-picker">{REACTIONS.map((emoji) => <button key={emoji} onClick={() => react(emoji)}>{emoji}</button>)}<button className="hand" onClick={raiseHand}><Hand size={20}/><span>Levantar mão</span></button></section>, room, 'foco-reaction-picker')}

    {moreOpen && createPortal(<section className="fl-more-menu">
      {isHost && <button onClick={openApps}><AppWindow/><div><b>Apps da aula</b><small>Piano, Board, Timer, Enquete e Voice Studio</small></div></button>}
      <button onClick={openPiP}><PictureInPicture2/><div><b>Picture in picture</b><small>Manter a aula em uma janela flutuante</small></div></button>
      <button onClick={() => setViewOpen((value) => !value)}><Grid2X2/><div><b>Ajustar visualização</b><small>Atual: {activeLayout}</small></div></button>
      {viewOpen && <div className="fl-view-options">
        <button className={activeLayout === 'Aula' ? 'active' : ''} onClick={() => setLayout('Aula')}><LayoutPanelTop/><span>Aula</span>{activeLayout === 'Aula' && <Check/>}</button>
        <button className={activeLayout === 'Grade' ? 'active' : ''} onClick={() => setLayout('Grade')}><Grid2X2/><span>Grade</span>{activeLayout === 'Grade' && <Check/>}</button>
        <button className={activeLayout === 'Automático' ? 'active' : ''} onClick={() => setLayout('Automático')}><Sparkles/><span>Automático</span>{activeLayout === 'Automático' && <Check/>}</button>
      </div>}
      <button onClick={toggleFullscreen}><Expand/><div><b>Tela cheia</b><small>Expandir o Foco Live</small></div></button>
      <button onClick={() => { setSettingsOpen(true); setMoreOpen(false); }}><Settings2/><div><b>Configurações</b><small>Áudio, vídeo e preferências</small></div></button>
      {isHost && <button onClick={() => { document.querySelector<HTMLButtonElement>('.fl-recording-button')?.click(); setMoreOpen(false); }}><span className="menu-icon">●</span><div><b>Gravação</b><small>Iniciar ou encerrar gravação</small></div></button>}
      {isHost && <button onClick={openDirection}><Settings2/><div><b>Direção da aula</b><small>Transmissão, ofertas e controles</small></div></button>}
    </section>, room, 'foco-more-menu')}

    {settingsOpen && createPortal(<div className="fl-live-settings-backdrop" onPointerDown={() => setSettingsOpen(false)}>
      <section className="fl-live-settings-modal" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><small>FOCO LIVE</small><strong>Configurações</strong></div><button onClick={() => setSettingsOpen(false)}><X/></button></header>
        <div className="fl-settings-role"><span>{isHost ? 'Dono da sala' : 'Participante'}</span><small>{isHost ? 'Controles administrativos habilitados' : 'Apenas preferências pessoais'}</small></div>
        <button onClick={() => openDevicePanel('mic')}><Mic2/><div><b>Áudio</b><small>Microfone e perfil de processamento</small></div><i>›</i></button>
        <button onClick={() => openDevicePanel('camera')}><Video/><div><b>Vídeo</b><small>Câmera, dispositivo e espelhamento</small></div><i>›</i></button>
        <button onClick={() => { setSettingsOpen(false); setMoreOpen(true); setViewOpen(true); }}><Grid2X2/><div><b>Visualização</b><small>Aula, Grade ou Automático</small></div><i>›</i></button>
      </section>
    </div>, document.body, 'foco-live-settings')}

    {createPortal(<div className="fl-floating-reactions" aria-hidden="true">{floating.map((item) => <div key={item.id} style={{ left: `${item.left}%` }}><span>{item.emoji}</span><small>{item.name}</small></div>)}</div>, room, 'foco-floating-reactions')}
  </>;
}
