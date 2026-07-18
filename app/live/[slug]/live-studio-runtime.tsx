'use client';

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DailyIframe from '@daily-co/daily-js';
import {
  Bold, Brush, Circle, Download, Eraser, Eye, EyeOff, Italic, List,
  Mic2, Minus, MousePointer2, Move, Plus, Redo2, RotateCcw, Square,
  StopCircle, Text, Trash2, Type, Underline, Undo2, Video, X,
} from 'lucide-react';

type StudioApp = 'board' | 'voice' | null;
type SceneLayout = 'fullscreen' | 'pip' | 'split';
type CameraShape = 'round' | 'square' | 'wide';
type CameraCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type BoardTool = 'select' | 'pen' | 'highlight' | 'text' | 'line' | 'rect' | 'circle' | 'eraser';
type Point = { x: number; y: number };
type Stroke = { id: string; tool: Exclude<BoardTool, 'select' | 'text'>; points: Point[]; color: string; width: number };
type TextBlock = { id: string; x: number; y: number; html: string };
type Track = { id: string; name: string; color: string; url: string; blob: Blob; muted: boolean; solo: boolean; volume: number };
type SceneMessage = {
  type: 'foco-studio-scene';
  open: boolean;
  app: StudioApp;
  layout: SceneLayout;
  cameraShape: CameraShape;
  cameraCorner: CameraCorner;
};
type StudioWindow = Window & {
  __FOCO_LIVE_CALL__?: any;
  __FOCO_STUDIO_WRAPPED__?: boolean;
  __FOCO_STUDIO_LISTENERS__?: Set<(message: SceneMessage) => void>;
};

const TRACK_COLORS = ['#7c3aed', '#0ea5e9', '#f97316', '#10b981', '#ec4899', '#eab308'];

function attachCall(call: any, target: StudioWindow) {
  if (!call || typeof call !== 'object') return;
  target.__FOCO_LIVE_CALL__ = call;
  if ((call as any).__focoStudioAttached) return;
  (call as any).__focoStudioAttached = true;
  call.on?.('app-message', (event: any) => {
    const data = event?.data as SceneMessage | undefined;
    if (data?.type !== 'foco-studio-scene') return;
    target.__FOCO_STUDIO_LISTENERS__?.forEach((listener) => listener(data));
  });
}

function installBridge(listener: (message: SceneMessage) => void) {
  const target = window as StudioWindow;
  target.__FOCO_STUDIO_LISTENERS__ ||= new Set();
  target.__FOCO_STUDIO_LISTENERS__.add(listener);
  if (!target.__FOCO_STUDIO_WRAPPED__) {
    const original = DailyIframe.createCallObject.bind(DailyIframe);
    (DailyIframe as any).createCallObject = (...args: any[]) => {
      const call = original(...args);
      attachCall(call, target);
      return call;
    };
    target.__FOCO_STUDIO_WRAPPED__ = true;
  }
  if (target.__FOCO_LIVE_CALL__) attachCall(target.__FOCO_LIVE_CALL__, target);
  return (): void => { target.__FOCO_STUDIO_LISTENERS__?.delete(listener); };
}

export default function LiveStudioRuntime() {
  const [ready, setReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [app, setApp] = useState<StudioApp>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [layout, setLayout] = useState<SceneLayout>('pip');
  const [cameraShape, setCameraShape] = useState<CameraShape>('round');
  const [cameraCorner, setCameraCorner] = useState<CameraCorner>('bottom-right');
  const stage = ready ? document.querySelector('.fl-stage-video-area') : null;

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    const sync = () => setReady(Boolean(document.querySelector('.fl-room') && document.querySelector('.fl-stage-video-area')));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  useEffect(() => installBridge((message) => {
    if (isHost) return;
    setApp(message.open ? message.app : null);
    setBroadcasting(Boolean(message.open));
    setLayout(message.layout);
    setCameraShape(message.cameraShape);
    setCameraCorner(message.cameraCorner);
  }), [isHost]);

  useEffect(() => {
    const openBoard = () => setApp('board');
    const openVoice = () => setApp('voice');
    window.addEventListener('foco-board-toggle', openBoard);
    window.addEventListener('foco-voice-studio-toggle', openVoice);
    return () => {
      window.removeEventListener('foco-board-toggle', openBoard);
      window.removeEventListener('foco-voice-studio-toggle', openVoice);
    };
  }, []);

  useEffect(() => {
    const room = document.querySelector('.fl-room');
    room?.classList.toggle('foco-studio-scene-open', Boolean(app));
    room?.classList.toggle('foco-studio-broadcasting', broadcasting);
    if (app) {
      room?.setAttribute('data-studio-layout', layout);
      room?.setAttribute('data-camera-shape', cameraShape);
      room?.setAttribute('data-camera-corner', cameraCorner);
    }
    return () => {
      room?.classList.remove('foco-studio-scene-open', 'foco-studio-broadcasting');
      room?.removeAttribute('data-studio-layout');
      room?.removeAttribute('data-camera-shape');
      room?.removeAttribute('data-camera-corner');
    };
  }, [app, broadcasting, cameraCorner, cameraShape, layout, ready]);

  function publish(nextOpen: boolean, nextApp: StudioApp = app) {
    const message: SceneMessage = { type: 'foco-studio-scene', open: nextOpen, app: nextApp, layout, cameraShape, cameraCorner };
    (window as StudioWindow).__FOCO_LIVE_CALL__?.sendAppMessage?.(message, '*');
  }

  function toggleBroadcast() {
    if (!isHost || !app) return;
    const next = !broadcasting;
    setBroadcasting(next);
    publish(next);
  }

  function close() {
    if (broadcasting) publish(false, null);
    setBroadcasting(false);
    setApp(null);
  }

  if (!ready || !stage || !app) return null;

  return createPortal(
    <section className={`fl-studio-scene app-${app}`}>
      {isHost && <SceneToolbar
        app={app}
        broadcasting={broadcasting}
        layout={layout}
        cameraShape={cameraShape}
        cameraCorner={cameraCorner}
        setLayout={(value) => { setLayout(value); window.setTimeout(() => broadcasting && publish(true), 0); }}
        setCameraShape={(value) => { setCameraShape(value); window.setTimeout(() => broadcasting && publish(true), 0); }}
        setCameraCorner={(value) => { setCameraCorner(value); window.setTimeout(() => broadcasting && publish(true), 0); }}
        toggleBroadcast={toggleBroadcast}
        close={close}
      />}
      <div className="fl-studio-app-canvas">
        {app === 'board' ? <FocoBoard readOnly={!isHost} /> : <VoiceStudio readOnly={!isHost} />}
      </div>
    </section>,
    stage,
  );
}

function SceneToolbar(props: {
  app: Exclude<StudioApp, null>;
  broadcasting: boolean;
  layout: SceneLayout;
  cameraShape: CameraShape;
  cameraCorner: CameraCorner;
  setLayout: (value: SceneLayout) => void;
  setCameraShape: (value: CameraShape) => void;
  setCameraCorner: (value: CameraCorner) => void;
  toggleBroadcast: () => void;
  close: () => void;
}) {
  return <header className="fl-scene-toolbar">
    <div><small>FOCO LIVE STUDIO</small><strong>{props.app === 'board' ? 'Foco Board' : 'Voice Studio'}</strong></div>
    <label>Layout<select value={props.layout} onChange={(event) => props.setLayout(event.target.value as SceneLayout)}><option value="pip">Câmera flutuante</option><option value="split">Lado a lado</option><option value="fullscreen">Somente app</option></select></label>
    <label>Câmera<select value={props.cameraShape} onChange={(event) => props.setCameraShape(event.target.value as CameraShape)}><option value="round">Redonda</option><option value="square">Quadrada</option><option value="wide">Retangular</option></select></label>
    <label>Posição<select value={props.cameraCorner} onChange={(event) => props.setCameraCorner(event.target.value as CameraCorner)}><option value="top-left">Superior esquerdo</option><option value="top-right">Superior direito</option><option value="bottom-left">Inferior esquerdo</option><option value="bottom-right">Inferior direito</option></select></label>
    <button className={props.broadcasting ? 'live' : ''} onClick={props.toggleBroadcast}>{props.broadcasting ? <EyeOff size={16} /> : <Eye size={16} />}{props.broadcasting ? 'Parar exibição' : 'Exibir para a turma'}</button>
    <button className="icon" onClick={props.close}><X size={18} /></button>
  </header>;
}

function FocoBoard({ readOnly }: { readOnly: boolean }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<BoardTool>('pen');
  const [color, setColor] = useState('#7c3aed');
  const [width, setWidth] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextBlock[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);

  function relativePoint(event: ReactPointerEvent): Point {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left || 0), y: event.clientY - (rect?.top || 0) };
  }

  function pointerDown(event: ReactPointerEvent) {
    if (readOnly || tool === 'select' || tool === 'text') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = relativePoint(event);
    const next: Stroke = { id: crypto.randomUUID(), tool: tool as Stroke['tool'], points: [point], color, width: tool === 'highlight' ? 18 : width };
    drawingRef.current = next;
    setStrokes((current) => [...current, next]);
    setRedoStack([]);
  }

  function pointerMove(event: ReactPointerEvent) {
    const active = drawingRef.current;
    if (!active) return;
    const point = relativePoint(event);
    active.points = [...active.points, point];
    setStrokes((current) => current.map((stroke) => stroke.id === active.id ? { ...active } : stroke));
  }

  function pointerUp() { drawingRef.current = null; }

  function addText(event: ReactPointerEvent) {
    if (readOnly || tool !== 'text') return;
    const point = relativePoint(event);
    setTexts((current) => [...current, { id: crypto.randomUUID(), x: point.x, y: point.y, html: 'Digite aqui' }]);
  }

  function undo() {
    setStrokes((current) => {
      const last = current.at(-1);
      if (last) setRedoStack((stack) => [...stack, last]);
      return current.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((current) => {
      const last = current.at(-1);
      if (last) setStrokes((stack) => [...stack, last]);
      return current.slice(0, -1);
    });
  }

  const svgPaths = useMemo(() => strokes.map((stroke) => {
    if (!stroke.points.length) return null;
    const start = stroke.points[0];
    const end = stroke.points.at(-1) || start;
    if (stroke.tool === 'line') return <line key={stroke.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />;
    if (stroke.tool === 'rect') return <rect key={stroke.id} x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} rx="8" />;
    if (stroke.tool === 'circle') return <ellipse key={stroke.id} cx={(start.x + end.x) / 2} cy={(start.y + end.y) / 2} rx={Math.abs(end.x - start.x) / 2} ry={Math.abs(end.y - start.y) / 2} fill="none" stroke={stroke.color} strokeWidth={stroke.width} />;
    const d = stroke.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    return <path key={stroke.id} d={d} fill="none" stroke={stroke.tool === 'eraser' ? '#ffffff' : stroke.color} strokeWidth={stroke.tool === 'eraser' ? 28 : stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.tool === 'highlight' ? 0.28 : 1} />;
  }), [strokes]);

  return <div className="fl-board-shell">
    {!readOnly && <aside className="fl-board-tools">
      {([['select', MousePointer2], ['pen', Brush], ['highlight', Bold], ['text', Type], ['line', Minus], ['rect', Square], ['circle', Circle], ['eraser', Eraser]] as const).map(([value, Icon]) => <button key={value} className={tool === value ? 'active' : ''} onClick={() => setTool(value)} title={value}><Icon size={17} /></button>)}
      <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Cor" />
      <input type="range" min="2" max="12" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
      <button onClick={undo} disabled={!strokes.length}><Undo2 size={17} /></button>
      <button onClick={redo} disabled={!redoStack.length}><Redo2 size={17} /></button>
      <button onClick={() => { setStrokes([]); setTexts([]); }}><Trash2 size={17} /></button>
    </aside>}
    <div ref={canvasRef} className={`fl-board-canvas tool-${tool}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onDoubleClick={addText}>
      <div className="fl-board-grid" />
      <svg><g>{svgPaths}</g></svg>
      {texts.map((block) => <RichTextBlock key={block.id} block={block} readOnly={readOnly} onChange={(html) => setTexts((current) => current.map((item) => item.id === block.id ? { ...item, html } : item))} />)}
      {!strokes.length && !texts.length && <div className="fl-board-empty"><strong>Foco Board</strong><span>Desenhe, destaque ou dê dois cliques para inserir texto.</span><div><b>🎼 Harmonia</b><b>🎤 Técnica vocal</b><b>🎹 Escalas</b></div></div>}
    </div>
  </div>;
}

function RichTextBlock({ block, readOnly, onChange }: { block: TextBlock; readOnly: boolean; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  function command(name: string) { document.execCommand(name); ref.current?.focus(); }
  return <div className="fl-rich-text" style={{ left: block.x, top: block.y }}>
    {!readOnly && <div className="fl-rich-toolbar"><button onMouseDown={(e) => { e.preventDefault(); command('bold'); }}><Bold size={13} /></button><button onMouseDown={(e) => { e.preventDefault(); command('italic'); }}><Italic size={13} /></button><button onMouseDown={(e) => { e.preventDefault(); command('underline'); }}><Underline size={13} /></button><button onMouseDown={(e) => { e.preventDefault(); command('insertUnorderedList'); }}><List size={13} /></button></div>}
    <div ref={ref} contentEditable={!readOnly} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: block.html }} onInput={(event) => onChange(event.currentTarget.innerHTML)} />
  </div>;
}

function VoiceStudio({ readOnly }: { readOnly: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [recording, setRecording] = useState(false);
  const [tempo, setTempo] = useState(90);
  const [countIn, setCountIn] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const metroRef = useRef<number | null>(null);

  useEffect(() => {
    if (!metronome) { if (metroRef.current) window.clearInterval(metroRef.current); return; }
    const context = new AudioContext();
    const click = () => { const osc = context.createOscillator(); const gain = context.createGain(); osc.frequency.value = 1050; gain.gain.setValueAtTime(0.12, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.05); osc.connect(gain).connect(context.destination); osc.start(); osc.stop(context.currentTime + 0.055); };
    click(); metroRef.current = window.setInterval(click, 60000 / tempo);
    return () => { if (metroRef.current) window.clearInterval(metroRef.current); void context.close(); };
  }, [metronome, tempo]);

  async function startRecording() {
    if (readOnly || recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (countIn) await new Promise((resolve) => window.setTimeout(resolve, (60000 / tempo) * 4));
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setTracks((current) => [...current, { id: crypto.randomUUID(), name: `Voz ${current.length + 1}`, color: TRACK_COLORS[current.length % TRACK_COLORS.length], url, blob, muted: false, solo: false, volume: 1 }]);
      stream.getTracks().forEach((track) => track.stop());
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function stopRecording() { recorderRef.current?.stop(); setRecording(false); }
  function updateTrack(id: string, patch: Partial<Track>) { setTracks((current) => current.map((track) => track.id === id ? { ...track, ...patch } : track)); }
  function removeTrack(id: string) { setTracks((current) => current.filter((track) => track.id !== id)); }
  function playAll() {
    const soloed = tracks.filter((track) => track.solo);
    tracks.forEach((track) => {
      if (track.muted || (soloed.length && !track.solo)) return;
      const audio = new Audio(track.url); audio.volume = track.volume; void audio.play();
    });
  }
  function exportMix() {
    tracks.forEach((track) => { const anchor = document.createElement('a'); anchor.href = track.url; anchor.download = `${track.name.replace(/\s+/g, '-').toLowerCase()}.webm`; anchor.click(); });
  }

  return <div className="fl-voice-shell">
    <header className="fl-voice-header"><div><strong>Voice Studio</strong><small>Multipistas para demonstrações vocais ao vivo</small></div><div className="fl-voice-transport"><label>{tempo} BPM<input disabled={readOnly} type="range" min="50" max="180" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} /></label><button className={metronome ? 'active' : ''} disabled={readOnly} onClick={() => setMetronome((value) => !value)}>Metrônomo</button><button className={countIn ? 'active' : ''} disabled={readOnly} onClick={() => setCountIn((value) => !value)}>Contagem 4</button><button onClick={playAll} disabled={!tracks.length}><Video size={16} /> Ouvir todas</button>{!readOnly && <button onClick={exportMix} disabled={!tracks.length}><Download size={16} /> Exportar faixas</button>}</div></header>
    <section className="fl-track-list">
      {!tracks.length && <div className="fl-track-empty"><Mic2 size={34} /><strong>Construa uma harmonia por camadas</strong><span>Grave a voz principal, depois terça, quinta e outras demonstrações.</span></div>}
      {tracks.map((track) => <article key={track.id} className="fl-track-card" style={{ '--track-color': track.color } as React.CSSProperties}><i /><input disabled={readOnly} value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value })} /><audio src={track.url} controls /><button className={track.muted ? 'active' : ''} disabled={readOnly} onClick={() => updateTrack(track.id, { muted: !track.muted })}>M</button><button className={track.solo ? 'active' : ''} disabled={readOnly} onClick={() => updateTrack(track.id, { solo: !track.solo })}>S</button><input disabled={readOnly} type="range" min="0" max="1" step="0.05" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })} />{!readOnly && <button onClick={() => removeTrack(track.id)}><Trash2 size={15} /></button>}</article>)}
    </section>
    {!readOnly && <footer className="fl-voice-recorder"><button className={recording ? 'recording' : ''} onClick={recording ? stopRecording : startRecording}>{recording ? <StopCircle size={21} /> : <Mic2 size={21} />}{recording ? 'Parar gravação' : 'Gravar nova voz'}</button><span>{recording ? 'Gravando demonstração…' : 'O áudio é processado localmente no navegador.'}</span></footer>}
  </div>;
}
