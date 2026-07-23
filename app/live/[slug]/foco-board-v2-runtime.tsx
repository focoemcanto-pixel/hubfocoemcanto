'use client';

import { PointerEvent as ReactPointerEvent, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, Brush, Circle, Diamond, Eraser, Hand, Highlighter, ImagePlus,
  Layers3, Menu, Minus, MousePointer2, Plus, Redo2, Save, Shapes, Square,
  StickyNote, Trash2, Type, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react';

type Tool = 'select' | 'hand' | 'pen' | 'highlight' | 'text' | 'sticky' | 'line' | 'arrow' | 'rect' | 'circle' | 'diamond' | 'eraser';
type Point = { x: number; y: number };
type BoardObject = {
  id: string;
  type: Exclude<Tool, 'select' | 'hand'>;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  color: string;
  fill?: string;
  strokeWidth: number;
  points?: Point[];
  text?: string;
  fontSize?: number;
};
type Snapshot = { objects: BoardObject[]; zoom: number; pan: Point };

const STORAGE_KEY = 'foco-board-v2-autosave';
const COLORS = ['#18181b', '#ef4444', '#22c55e', '#2563eb', '#7c3aed', '#f59e0b'];
const FILLS = ['transparent', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe', '#fee2e2'];

function cloneObjects(value: BoardObject[]) {
  return value.map(item => ({ ...item, points: item.points?.map(point => ({ ...point })) }));
}

export default function FocoBoardV2Runtime() {
  const [target, setTarget] = useState<Element | null>(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    setIsHost(new URLSearchParams(window.location.search).get('host') === '1');
    const sync = () => {
      const scene = document.querySelector('.fl-studio-scene.app-board');
      setTarget(scene?.querySelector('.fl-studio-app-canvas') || null);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  if (!isHost || !target) return null;
  return createPortal(<FocoBoardV2 />, target);
}

function FocoBoardV2() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState('#18181b');
  const [fill, setFill] = useState('#fef3c7');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [history, setHistory] = useState<BoardObject[][]>([]);
  const [future, setFuture] = useState<BoardObject[][]>([]);
  const actionRef = useRef<{ kind: 'draw' | 'move' | 'pan'; id?: string; start: Point; origin?: Point } | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Snapshot | null;
      if (saved?.objects) {
        setObjects(saved.objects);
        setZoom(saved.zoom || 1);
        setPan(saved.pan || { x: 0, y: 0 });
      }
    } catch {}
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects, zoom, pan } satisfies Snapshot));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [objects, zoom, pan]);

  const selected = useMemo(() => objects.find(item => item.id === selectedId) || null, [objects, selectedId]);

  function checkpoint() {
    setHistory(current => [...current.slice(-49), cloneObjects(objects)]);
    setFuture([]);
  }

  function undo() {
    setHistory(current => {
      const previous = current.at(-1);
      if (!previous) return current;
      setFuture(next => [cloneObjects(objects), ...next].slice(0, 50));
      setObjects(cloneObjects(previous));
      setSelectedId(null);
      return current.slice(0, -1);
    });
  }

  function redo() {
    setFuture(current => {
      const next = current[0];
      if (!next) return current;
      setHistory(previous => [...previous, cloneObjects(objects)].slice(-50));
      setObjects(cloneObjects(next));
      setSelectedId(null);
      return current.slice(1);
    });
  }

  function boardPoint(event: { clientX: number; clientY: number }) {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: ((event.clientX - (rect?.left || 0)) - pan.x) / zoom,
      y: ((event.clientY - (rect?.top || 0)) - pan.y) / zoom,
    };
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = boardPoint(event);
    if (tool === 'hand') {
      actionRef.current = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, origin: pan };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'select') {
      setSelectedId(null);
      return;
    }
    checkpoint();
    const id = crypto.randomUUID();
    const base: BoardObject = {
      id, type: tool as BoardObject['type'], x: point.x, y: point.y, width: 1, height: 1,
      color, fill: tool === 'sticky' ? fill : 'transparent', strokeWidth,
    };
    if (tool === 'text') {
      base.width = 240; base.height = 70; base.text = 'Digite seu texto'; base.fontSize = 24;
      setObjects(current => [...current, base]); setSelectedId(id); setTool('select'); return;
    }
    if (tool === 'sticky') {
      base.width = 240; base.height = 190; base.text = 'Nova anotação'; base.fontSize = 22;
      setObjects(current => [...current, base]); setSelectedId(id); setTool('select'); return;
    }
    if (tool === 'pen' || tool === 'highlight' || tool === 'eraser') base.points = [point];
    setObjects(current => [...current, base]);
    actionRef.current = { kind: 'draw', id, start: point };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const action = actionRef.current;
    if (!action) return;
    if (action.kind === 'pan') {
      setPan({ x: (action.origin?.x || 0) + event.clientX - action.start.x, y: (action.origin?.y || 0) + event.clientY - action.start.y });
      return;
    }
    const point = boardPoint(event);
    setObjects(current => current.map(item => {
      if (item.id !== action.id) return item;
      if (item.points) return { ...item, points: [...item.points, point] };
      return {
        ...item,
        x: Math.min(action.start.x, point.x), y: Math.min(action.start.y, point.y),
        width: Math.max(2, Math.abs(point.x - action.start.x)), height: Math.max(2, Math.abs(point.y - action.start.y)),
      };
    }));
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    actionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function selectObject(event: ReactPointerEvent, id: string) {
    if (tool !== 'select') return;
    event.stopPropagation();
    const item = objects.find(value => value.id === id);
    if (!item) return;
    setSelectedId(id);
    checkpoint();
    actionRef.current = { kind: 'move', id, start: boardPoint(event), origin: { x: item.x, y: item.y } };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveSelected(event: ReactPointerEvent) {
    const action = actionRef.current;
    if (action?.kind !== 'move' || !action.id) return;
    const point = boardPoint(event);
    setObjects(current => current.map(item => item.id === action.id ? {
      ...item,
      x: (action.origin?.x || 0) + point.x - action.start.x,
      y: (action.origin?.y || 0) + point.y - action.start.y,
    } : item));
  }

  function endMove(event: ReactPointerEvent) {
    if (actionRef.current?.kind === 'move') actionRef.current = null;
    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  }

  function updateSelected(patch: Partial<BoardObject>) {
    if (!selectedId) return;
    setObjects(current => current.map(item => item.id === selectedId ? { ...item, ...patch } : item));
  }

  function removeSelected() {
    if (!selectedId) return;
    checkpoint();
    setObjects(current => current.filter(item => item.id !== selectedId));
    setSelectedId(null);
  }

  function clearBoard() {
    if (!objects.length) return;
    checkpoint();
    setObjects([]); setSelectedId(null);
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setZoom(value => Math.min(2.5, Math.max(.25, Number((value - event.deltaY * .0015).toFixed(2)))));
    } else {
      setPan(value => ({ x: value.x - event.deltaX, y: value.y - event.deltaY }));
    }
  }

  return <div className="fb2-root">
    <header className="fb2-topbar">
      <div className="fb2-title"><Menu size={18}/><div><strong>Foco Board</strong><span>Quadro da aula</span></div></div>
      <div className="fb2-history"><button onClick={undo} disabled={!history.length} title="Desfazer"><Undo2/></button><button onClick={redo} disabled={!future.length} title="Refazer"><Redo2/></button></div>
      <button className="fb2-save" onClick={() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects, zoom, pan }))}><Save size={16}/> Salvo</button>
    </header>

    <aside className="fb2-tools">
      <ToolButton value="select" label="Selecionar" icon={<MousePointer2/>} tool={tool} setTool={setTool}/>
      <ToolButton value="hand" label="Mover" icon={<Hand/>} tool={tool} setTool={setTool}/>
      <span/>
      <ToolButton value="pen" label="Caneta" icon={<Brush/>} tool={tool} setTool={setTool}/>
      <ToolButton value="highlight" label="Marca-texto" icon={<Highlighter/>} tool={tool} setTool={setTool}/>
      <ToolButton value="eraser" label="Borracha" icon={<Eraser/>} tool={tool} setTool={setTool}/>
      <span/>
      <ToolButton value="text" label="Texto" icon={<Type/>} tool={tool} setTool={setTool}/>
      <ToolButton value="sticky" label="Nota" icon={<StickyNote/>} tool={tool} setTool={setTool}/>
      <ToolButton value="rect" label="Retângulo" icon={<Square/>} tool={tool} setTool={setTool}/>
      <ToolButton value="circle" label="Círculo" icon={<Circle/>} tool={tool} setTool={setTool}/>
      <ToolButton value="diamond" label="Losango" icon={<Diamond/>} tool={tool} setTool={setTool}/>
      <ToolButton value="line" label="Linha" icon={<Minus/>} tool={tool} setTool={setTool}/>
      <ToolButton value="arrow" label="Seta" icon={<ArrowRight/>} tool={tool} setTool={setTool}/>
      <span/>
      <button title="Imagens (próxima etapa)" disabled><ImagePlus/></button>
      <button title="Biblioteca musical (próxima etapa)" disabled><Layers3/></button>
    </aside>

    <div className="fb2-viewport" ref={viewportRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={onWheel}>
      <div className="fb2-world" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
        <div className="fb2-grid"/>
        <svg className="fb2-svg" width="4000" height="3000" viewBox="0 0 4000 3000">
          <defs><marker id="fb2-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>
          {objects.filter(item => ['pen','highlight','eraser','line','arrow','rect','circle','diamond'].includes(item.type)).map(item => <BoardSvgObject key={item.id} item={item} selected={selectedId === item.id} onPointerDown={event => selectObject(event, item.id)} onPointerMove={moveSelected} onPointerUp={endMove}/>)}
        </svg>
        {objects.filter(item => item.type === 'text' || item.type === 'sticky').map(item => <div key={item.id} className={`fb2-object fb2-${item.type}${selectedId === item.id ? ' selected' : ''}`} style={{ left:item.x, top:item.y, width:item.width, minHeight:item.height, background:item.type === 'sticky' ? item.fill : 'transparent', color:item.color, fontSize:item.fontSize }} onPointerDown={event => selectObject(event,item.id)} onPointerMove={moveSelected} onPointerUp={endMove}>
          <div contentEditable suppressContentEditableWarning onPointerDown={event => { if (tool === 'select' && selectedId === item.id) event.stopPropagation(); }} onBlur={event => updateSelected({ text:event.currentTarget.innerText })}>{item.text}</div>
        </div>)}
      </div>
    </div>

    <div className="fb2-zoom"><button onClick={() => setZoom(value => Math.max(.25, Number((value-.1).toFixed(2))))}><ZoomOut/></button><b>{Math.round(zoom*100)}%</b><button onClick={() => setZoom(value => Math.min(2.5, Number((value+.1).toFixed(2))))}><ZoomIn/></button></div>

    {selected && <div className="fb2-inspector">
      <div><span>Contorno</span>{COLORS.map(value => <button key={value} className={selected.color===value?'active':''} style={{background:value}} onClick={() => updateSelected({color:value})}/>)}</div>
      {(selected.type === 'sticky' || ['rect','circle','diamond'].includes(selected.type)) && <div><span>Fundo</span>{FILLS.map(value => <button key={value} className={selected.fill===value?'active':''} style={{background:value === 'transparent' ? 'white' : value}} onClick={() => updateSelected({fill:value})}/>)}</div>}
      <label>Espessura<input type="range" min="1" max="12" value={selected.strokeWidth} onChange={event => updateSelected({strokeWidth:Number(event.target.value)})}/></label>
      {(selected.type === 'text' || selected.type === 'sticky') && <label>Tamanho<input type="range" min="14" max="64" value={selected.fontSize || 22} onChange={event => updateSelected({fontSize:Number(event.target.value)})}/></label>}
      <button className="danger" onClick={removeSelected}><Trash2 size={16}/> Excluir</button>
    </div>}

    {!selected && !objects.length && <div className="fb2-welcome"><Shapes/><strong>Comece sua aula</strong><span>Desenhe, crie notas, textos, formas e organize as ideias livremente.</span></div>}
    <button className="fb2-clear" onClick={clearBoard}><Trash2 size={15}/> Limpar tela</button>
  </div>;
}

function ToolButton({ value, label, icon, tool, setTool }: { value: Tool; label: string; icon: React.ReactNode; tool: Tool; setTool: (tool: Tool) => void }) {
  return <button className={tool === value ? 'active' : ''} title={label} onClick={() => setTool(value)}>{icon}</button>;
}

function BoardSvgObject({ item, selected, onPointerDown, onPointerMove, onPointerUp }: { item: BoardObject; selected: boolean; onPointerDown: (event: ReactPointerEvent<SVGElement>) => void; onPointerMove: (event: ReactPointerEvent<SVGElement>) => void; onPointerUp: (event: ReactPointerEvent<SVGElement>) => void }) {
  const common = { stroke: item.type === 'eraser' ? '#fff' : item.color, strokeWidth: item.type === 'highlight' ? 18 : item.type === 'eraser' ? 28 : item.strokeWidth, fill: item.fill || 'transparent', opacity: item.type === 'highlight' ? .32 : 1, onPointerDown, onPointerMove, onPointerUp, className: selected ? 'selected' : '', style: { pointerEvents:'stroke' as const } };
  if (item.points) {
    const d = item.points.map((point,index) => `${index?'L':'M'} ${point.x} ${point.y}`).join(' ');
    return <path d={d} {...common} fill="none" strokeLinecap="round" strokeLinejoin="round"/>;
  }
  if (item.type === 'line' || item.type === 'arrow') return <line x1={item.x} y1={item.y} x2={item.x+item.width} y2={item.y+item.height} {...common} markerEnd={item.type==='arrow'?'url(#fb2-arrow)':undefined}/>;
  if (item.type === 'circle') return <ellipse cx={item.x+item.width/2} cy={item.y+item.height/2} rx={item.width/2} ry={item.height/2} {...common}/>;
  if (item.type === 'diamond') return <polygon points={`${item.x+item.width/2},${item.y} ${item.x+item.width},${item.y+item.height/2} ${item.x+item.width/2},${item.y+item.height} ${item.x},${item.y+item.height/2}`} {...common}/>;
  return <rect x={item.x} y={item.y} width={item.width} height={item.height} rx="8" {...common}/>;
}
