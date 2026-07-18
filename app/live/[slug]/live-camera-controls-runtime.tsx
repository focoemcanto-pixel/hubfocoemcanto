'use client';

import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, FlipHorizontal2, RectangleHorizontal, Settings2, Square, X } from 'lucide-react';

type CameraShape = 'round' | 'square' | 'wide';
type CameraTransform = { x: number; y: number; width: number; height: number; shape: CameraShape; radius: number; mirrored: boolean };
type CameraMessage = { type: 'foco-camera-transform'; transform: CameraTransform };
type DragMode = 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw';
type StudioWindow = Window & { __FOCO_LIVE_CALL__?: any };

const DEFAULT_TRANSFORM: CameraTransform = { x: 76, y: 57, width: 20, height: 34, shape: 'round', radius: 50, mirrored: true };
const STORAGE_KEY = 'foco-live-camera-transform-v2';
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

export default function LiveCameraControlsRuntime() {
  const [ready, setReady] = useState(false);
  const [, setDomVersion] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [selected, setSelected] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transform, setTransform] = useState<CameraTransform>(DEFAULT_TRANSFORM);
  const transformRef = useRef(transform);
  const domSignatureRef = useRef('');
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; initial: CameraTransform } | null>(null);
  const attachedCallRef = useRef<any>(null);

  const stage = ready ? document.querySelector<HTMLElement>('.fl-stage-video-area') : null;
  const room = ready ? document.querySelector<HTMLElement>('.fl-room') : null;
  const camera = ready ? document.querySelector<HTMLElement>('.fl-stage-video-area .fl-speaker-layout, .fl-stage-video-area .fl-native-grid') : null;
  const sceneActive = Boolean(room?.classList.contains('foco-studio-scene-open'));
  const pipActive = room?.dataset.studioLayout === 'pip';

  useEffect(() => { transformRef.current = transform; }, [transform]);

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    try { const saved = window.localStorage.getItem(STORAGE_KEY); if (saved) setTransform({ ...DEFAULT_TRANSFORM, ...JSON.parse(saved) }); } catch {}
    const sync = () => {
      const currentRoom = document.querySelector<HTMLElement>('.fl-room');
      const currentStage = document.querySelector('.fl-stage-video-area');
      const currentCamera = document.querySelector('.fl-stage-video-area .fl-speaker-layout, .fl-stage-video-area .fl-native-grid');
      const signature = `${Boolean(currentRoom)}:${Boolean(currentStage)}:${Boolean(currentCamera)}:${currentRoom?.classList.contains('foco-studio-scene-open')}:${currentRoom?.dataset.studioLayout || ''}`;
      setReady(Boolean(currentRoom && currentStage));
      if (signature !== domSignatureRef.current) { domSignatureRef.current = signature; setDomVersion((value) => value + 1); }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(sync, 250);
    sync();
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!camera || !sceneActive || !pipActive) return;
    camera.style.setProperty('--camera-x', `${transform.x}%`);
    camera.style.setProperty('--camera-y', `${transform.y}%`);
    camera.style.setProperty('--camera-width', `${transform.width}%`);
    camera.style.setProperty('--camera-height', `${transform.height}%`);
    camera.style.setProperty('--camera-radius', transform.shape === 'round' ? '50%' : transform.shape === 'square' ? `${Math.min(transform.radius, 24)}px` : `${transform.radius}px`);
    camera.dataset.cameraShape = transform.shape;
    camera.dataset.cameraMirrored = transform.mirrored ? 'true' : 'false';
    camera.classList.toggle('fl-camera-selected', isHost && selected);
    return () => camera.classList.remove('fl-camera-selected');
  }, [camera, isHost, pipActive, sceneActive, selected, transform]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const call = (window as StudioWindow).__FOCO_LIVE_CALL__;
      if (!call || attachedCallRef.current === call) return;
      attachedCallRef.current = call;
      call.on?.('app-message', (event: any) => {
        const data = event?.data as CameraMessage | undefined;
        if (data?.type === 'foco-camera-transform' && !isHost && data.transform) setTransform(data.transform);
      });
      call.on?.('participant-joined', () => {
        if (isHost && document.querySelector('.fl-room.foco-studio-broadcasting')) call.sendAppMessage?.({ type: 'foco-camera-transform', transform: transformRef.current }, '*');
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [isHost, ready]);

  useEffect(() => {
    if (!isHost) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transform)); } catch {}
    if (room?.classList.contains('foco-studio-broadcasting')) (window as StudioWindow).__FOCO_LIVE_CALL__?.sendAppMessage?.({ type: 'foco-camera-transform', transform }, '*');
  }, [isHost, room, transform]);

  useEffect(() => {
    if (!isHost || !sceneActive || !pipActive) return;
    const clear = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.fl-speaker-layout,.fl-native-grid,.fl-camera-settings-panel')) { setSelected(false); setSettingsOpen(false); }
    };
    window.addEventListener('pointerdown', clear);
    return () => window.removeEventListener('pointerdown', clear);
  }, [isHost, pipActive, sceneActive]);

  function startDrag(event: ReactPointerEvent, mode: DragMode) {
    if (!stage) return;
    event.preventDefault(); event.stopPropagation(); setSelected(true);
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, initial: transformRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / rect.height) * 100;
    const next = { ...drag.initial };
    if (drag.mode === 'move') {
      next.x = clamp(drag.initial.x + dx, 0, 100 - next.width);
      next.y = clamp(drag.initial.y + dy, 0, 100 - next.height);
    } else {
      const west = drag.mode.endsWith('w');
      const north = drag.mode.startsWith('resize-n');
      next.width = clamp(drag.initial.width + (west ? -dx : dx), 8, 60);
      next.height = clamp(drag.initial.height + (north ? -dy : dy), 10, 75);
      if (west) next.x = clamp(drag.initial.x + dx, 0, drag.initial.x + drag.initial.width - 8);
      if (north) next.y = clamp(drag.initial.y + dy, 0, drag.initial.y + drag.initial.height - 10);
      if (next.shape !== 'wide') next.height = clamp((next.width * rect.width) / rect.height, 10, 75);
      next.x = clamp(next.x, 0, 100 - next.width); next.y = clamp(next.y, 0, 100 - next.height);
    }
    setTransform(next);
  }

  function stopDrag() { dragRef.current = null; }
  function setShape(shape: CameraShape) {
    if (!stage) return setTransform((current) => ({ ...current, shape }));
    const rect = stage.getBoundingClientRect();
    setTransform((current) => shape === 'wide'
      ? { ...current, shape, width: Math.max(current.width, 24), height: Math.max(16, current.height * .62), radius: Math.min(current.radius, 28) }
      : { ...current, shape, height: clamp((current.width * rect.width) / rect.height, 10, 75), radius: shape === 'round' ? 50 : 18 });
  }

  if (!ready || !stage || !camera || !sceneActive || !pipActive || !isHost) return null;

  return <>
    {createPortal(<div className="fl-camera-object-controls" onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <button className="fl-camera-drag-surface" aria-label="Mover câmera" onPointerDown={(event) => startDrag(event, 'move')} />
      {selected && <><button className="fl-camera-settings-trigger" aria-label="Configurações da câmera" onClick={(event) => { event.stopPropagation(); setSettingsOpen((value) => !value); }}><Settings2 size={16} /></button>{(['resize-nw','resize-ne','resize-sw','resize-se'] as DragMode[]).map((mode) => <button key={mode} className={`fl-camera-resize ${mode}`} aria-label="Redimensionar câmera" onPointerDown={(event) => startDrag(event, mode)} />)}</>}
    </div>, camera)}
    {settingsOpen && createPortal(<section className="fl-camera-settings-panel">
      <header><div><small>FOCO LIVE</small><strong>Ajustes da câmera</strong></div><button onClick={() => setSettingsOpen(false)}><X size={16} /></button></header>
      <div className="fl-camera-shapes"><button className={transform.shape === 'round' ? 'active' : ''} onClick={() => setShape('round')}><Circle size={20} /><span>Redonda</span></button><button className={transform.shape === 'square' ? 'active' : ''} onClick={() => setShape('square')}><Square size={20} /><span>Quadrada</span></button><button className={transform.shape === 'wide' ? 'active' : ''} onClick={() => setShape('wide')}><RectangleHorizontal size={20} /><span>Retangular</span></button></div>
      {transform.shape !== 'round' && <label>Arredondamento <span>{transform.radius}px</span><input type="range" min="0" max="48" value={transform.radius} onChange={(event) => setTransform((current) => ({ ...current, radius: Number(event.target.value) }))} /></label>}
      <button className={transform.mirrored ? 'toggle active' : 'toggle'} onClick={() => setTransform((current) => ({ ...current, mirrored: !current.mirrored }))}><FlipHorizontal2 size={17} /><div><b>Espelhar imagem</b><small>Mostra a câmera como um espelho</small></div><i /></button>
      <button className="reset" onClick={() => setTransform(DEFAULT_TRANSFORM)}>Restaurar tamanho e posição</button>
    </section>, stage)}
  </>;
}
