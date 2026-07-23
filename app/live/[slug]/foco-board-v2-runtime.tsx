'use client';

import { ChangeEvent, PointerEvent as ReactPointerEvent, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine, ArrowRight, ArrowUpToLine, Brush, Circle, Copy, Diamond,
  Eraser, Hand, Highlighter, ImagePlus, KeyboardMusic, Layers3, Menu, Minus,
  MousePointer2, Music2, Plus, Redo2, Save, Shapes, Square, StickyNote,
  Trash2, Type, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react';

type Tool = 'select' | 'hand' | 'pen' | 'highlight' | 'text' | 'sticky' | 'line' | 'arrow' | 'rect' | 'circle' | 'diamond' | 'eraser';
type ObjectType = Exclude<Tool, 'select' | 'hand'> | 'image' | 'staff' | 'keyboard';
type Point = { x: number; y: number };
type BoardObject = {
  id: string;
  type: ObjectType;
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
  src?: string;
  zIndex: number;
};
type Snapshot = { objects: BoardObject[]; zoom: number; pan: Point };
type Action = {
  kind: 'draw' | 'move' | 'pan' | 'resize';
  id?: string;
  start: Point;
  origin?: Point;
  size?: Point;
  handle?: 'nw' | 'ne' | 'sw' | 'se';
};

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
  const imageInputRef = useRef<HTMLInputElement>(null);
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const actionRef = useRef<Action | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Snapshot | null;
      if (saved?.objects) {
        setObjects(saved.objects.map((item, index) => ({ ...item, zIndex: item.zIndex ?? index + 1 })));
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') removeSelected();
      if (selectedId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        checkpoint();
        setObjects(current => current.map(item => item.id === selectedId ? {
          ...item,
          x: item.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
          y: item.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
        } : item));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selected = useMemo(() => objects.find(item => item.id === selectedId) || null, [objects, selectedId]);
  const nextZ = () => Math.max(0, ...objects.map(item => item.zIndex || 0)) + 1;

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
      color, fill: tool === 'sticky' ? fill : 'transparent', strokeWidth, zIndex: nextZ(),
    };
    if (tool === 'text') {
      base.width = 260; base.height = 76; base.text = 'Digite seu texto'; base.fontSize = 24;
      setObjects(current => [...current, base]); setSelectedId(id); setTool('select'); return;
    }
    if (tool === 'sticky') {
      base.width = 250; base.height = 200; base.text = 'Nova anotação'; base.fontSize = 22;
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
    if (action.kind === 'resize') {
      const point = boardPoint(event);
      setObjects(current => current.map(item => {
        if (item.id !== action.id || !action.origin || !action.size || !action.handle) return item;
        const dx = point.x - action.start.x;
        const dy = point.y - action.start.y;
        let x = action.origin.x;
        let y = action.origin.y;
        let width = action.size.x;
        let height = action.size.y;
        if (action.handle.includes('e')) width = Math.max(30, action.size.x + dx);
        if (action.handle.includes('s')) height = Math.max(30, action.size.y + dy);
        if (action.handle.includes('w')) { width = Math.max(30, action.size.x - dx); x = action.origin.x + action.size.x - width; }
        if (action.handle.includes('n')) { height = Math.max(30, action.size.y - dy); y = action.origin.y + action.size.y - height; }
        return { ...item, x, y, width, height };
      }));
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
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
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
    const element = event.currentTarget as Element;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>, handle: Action['handle']) {
    if (!selected) return;
    event.stopPropagation();
    checkpoint();
    actionRef.current = {
      kind: 'resize', id: selected.id, handle,
      start: boardPoint(event), origin: { x: selected.x, y: selected.y }, size: { x: selected.width, y: selected.height },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateSelected(patch: Partial<BoardObject>) {
    if (!selectedId) return;
    setObjects(current => current.map(item => item.id === selectedId ? { ...item, ...patch } : item));
  }

  function duplicateSelected() {
    if (!selected) return;
    checkpoint();
    const copy: BoardObject = { ...selected, id: crypto.randomUUID(), x: selected.x + 28, y: selected.y + 28, zIndex: nextZ(), points: selected.points?.map(point => ({ x: point.x + 28, y: point.y + 28 })) };
    setObjects(current => [...current, copy]);
    setSelectedId(copy.id);
  }

  function layer(direction: 'front' | 'back') {
    if (!selected) return;
    checkpoint();
    const value = direction === 'front' ? nextZ() : Math.min(0, ...objects.map(item => item.zIndex || 0)) - 1;
    updateSelected({ zIndex: value });
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

  function importImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      checkpoint();
      const id = crypto.randomUUID();
      const item: BoardObject = { id, type: 'image', x: 520, y: 300, width: 420, height: 280, color: '#18181b', strokeWidth: 1, src: String(reader.result), zIndex: nextZ() };
      setObjects(current => [...current, item]);
      setSelectedId(id);
      setTool('select');
    };
    reader.readAsDataURL(file);
  }

  function insertLibrary(type: 'staff' | 'keyboard' | 'lesson') {
    checkpoint();
    const baseZ = nextZ();
    if (type === 'staff') {
      const id = crypto.randomUUID();
      setObjects(current => [...current, { id, type: 'staff', x: 500, y: 320, width: 650, height: 210, color: '#18181b', fill: '#ffffff', strokeWidth: 2, zIndex: baseZ }]);
      setSelectedId(id);
    }
    if (type === 'keyboard') {
      const id = crypto.randomUUID();
      setObjects(current => [...current, { id, type: 'keyboard', x: 500, y: 320, width: 720, height: 230, color: '#18181b', fill: '#ffffff', strokeWidth: 2, zIndex: baseZ }]);
      setSelectedId(id);
    }
    if (type === 'lesson') {
      const heading: BoardObject = { id: crypto.randomUUID(), type: 'text', x: 420, y: 220, width: 560, height: 80, color: '#312e81', strokeWidth: 1, text: 'Tema da aula', fontSize: 42, zIndex: baseZ };
      const note1: BoardObject = { id: crypto.randomUUID(), type: 'sticky', x: 420, y: 340, width: 270, height: 210, color: '#18181b', fill: '#fef3c7', strokeWidth: 1, text: 'Conceito principal', fontSize: 24, zIndex: baseZ + 1 };
      const note2: BoardObject = { id: crypto.randomUUID(), type: 'sticky', x: 740, y: 340, width: 270, height: 210, color: '#18181b', fill: '#dbeafe', strokeWidth: 1, text: 'Exercício prático', fontSize: 24, zIndex: baseZ + 2 };
      setObjects(current => [...current, heading, note1, note2]);
      setSelectedId(heading.id);
    }
    setLibraryOpen(false);
    setTool('select');
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
      <button title="Adicionar imagem" onClick={() => imageInputRef.current?.click()}><ImagePlus/></button>
      <button className={libraryOpen ? 'active' : ''} title="Biblioteca musical" onClick={() => setLibraryOpen(value => !value)}><Layers3/></button>
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={importImage}/>
    </aside>

    {libraryOpen && <section className="fb2-library">
      <header><Music2 size={18}/><div><strong>Biblioteca musical</strong><span>Elementos prontos para a aula</span></div></header>
      <button onClick={() => insertLibrary('staff')}><span className="fb2-library-preview staff"/><div><strong>Pentagrama</strong><small>5 linhas musicais ajustáveis</small></div></button>
      <button onClick={() => insertLibrary('keyboard')}><KeyboardMusic/><div><strong>Teclado</strong><small>Diagrama de duas oitavas</small></div></button>
      <button onClick={() => insertLibrary('lesson')}><Shapes/><div><strong>Template de aula</strong><small>Título e notas organizadas</small></div></button>
    </section>}

    <div className="fb2-viewport" ref={viewportRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={onWheel}>
      <div className="fb2-world" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
        <div className="fb2-grid"/>
        <svg className="fb2-svg" width="4000" height="3000" viewBox="0 0 4000 3000">
          <defs><marker id="fb2-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>
          {objects.filter(item => ['pen','highlight','eraser','line','arrow','rect','circle','diamond'].includes(item.type)).sort((a,b) => a.zIndex-b.zIndex).map(item => <BoardSvgObject key={item.id} item={item} selected={selectedId === item.id} onPointerDown={event => selectObject(event, item.id)} onPointerMove={moveSelected} onPointerUp={endMove}/>)}
        </svg>
        {objects.filter(item => ['text','sticky','image','staff','keyboard'].includes(item.type)).sort((a,b) => a.zIndex-b.zIndex).map(item => <BoardHtmlObject key={item.id} item={item} selected={selectedId === item.id} tool={tool} onSelect={event => selectObject(event,item.id)} onMove={moveSelected} onEnd={endMove} onText={text => updateSelected({ text })}/>) }
        {selected && <SelectionBox item={selected} onResize={startResize}/>} 
      </div>
    </div>

    <div className="fb2-zoom"><button onClick={() => setZoom(value => Math.max(.25, Number((value-.1).toFixed(2))))}><ZoomOut/></button><b>{Math.round(zoom*100)}%</b><button onClick={() => setZoom(value => Math.min(2.5, Number((value+.1).toFixed(2))))}><ZoomIn/></button></div>

    {selected && <div className="fb2-inspector">
      <div><span>Contorno</span>{COLORS.map(value => <button key={value} className={selected.color===value?'active':''} style={{background:value}} onClick={() => updateSelected({color:value})}/>)}</div>
      {(selected.type === 'sticky' || ['rect','circle','diamond','staff','keyboard'].includes(selected.type)) && <div><span>Fundo</span>{FILLS.map(value => <button key={value} className={selected.fill===value?'active':''} style={{background:value === 'transparent' ? 'white' : value}} onClick={() => updateSelected({fill:value})}/>)}</div>}
      {!['image','staff','keyboard'].includes(selected.type) && <label>Espessura<input type="range" min="1" max="12" value={selected.strokeWidth} onChange={event => updateSelected({strokeWidth:Number(event.target.value)})}/></label>}
      {(selected.type === 'text' || selected.type === 'sticky') && <label>Tamanho<input type="range" min="14" max="64" value={selected.fontSize || 22} onChange={event => updateSelected({fontSize:Number(event.target.value)})}/></label>}
      <div className="fb2-inspector-actions">
        <button title="Duplicar" onClick={duplicateSelected}><Copy size={16}/></button>
        <button title="Trazer para frente" onClick={() => layer('front')}><ArrowUpToLine size={16}/></button>
        <button title="Enviar para trás" onClick={() => layer('back')}><ArrowDownToLine size={16}/></button>
      </div>
      <button className="danger" onClick={removeSelected}><Trash2 size={16}/> Excluir</button>
    </div>}

    {!selected && !objects.length && <div className="fb2-welcome"><Shapes/><strong>Comece sua aula</strong><span>Desenhe, crie notas, textos, formas e organize as ideias livremente.</span></div>}
    <button className="fb2-clear" onClick={clearBoard}><Trash2 size={15}/> Limpar tela</button>
  </div>;
}

function ToolButton({ value, label, icon, tool, setTool }: { value: Tool; label: string; icon: React.ReactNode; tool: Tool; setTool: (tool: Tool) => void }) {
  return <button className={tool === value ? 'active' : ''} title={label} onClick={() => setTool(value)}>{icon}</button>;
}

function BoardHtmlObject({ item, selected, tool, onSelect, onMove, onEnd, onText }: { item: BoardObject; selected: boolean; tool: Tool; onSelect: (event: ReactPointerEvent<HTMLDivElement>) => void; onMove: (event: ReactPointerEvent<HTMLDivElement>) => void; onEnd: (event: ReactPointerEvent<HTMLDivElement>) => void; onText: (text: string) => void }) {
  const style = { left:item.x, top:item.y, width:item.width, height:item.height, background:item.type === 'sticky' ? item.fill : 'transparent', color:item.color, fontSize:item.fontSize, zIndex:item.zIndex };
  if (item.type === 'image') return <div className={`fb2-object fb2-image${selected?' selected':''}`} style={style} onPointerDown={onSelect} onPointerMove={onMove} onPointerUp={onEnd}><img src={item.src} alt="Imagem do quadro" draggable={false}/></div>;
  if (item.type === 'staff') return <div className={`fb2-object fb2-music-object${selected?' selected':''}`} style={{...style, background:item.fill || '#fff'}} onPointerDown={onSelect} onPointerMove={onMove} onPointerUp={onEnd}><div className="fb2-staff">{[0,1,2,3,4].map(line => <i key={line}/>)}</div></div>;
  if (item.type === 'keyboard') return <div className={`fb2-object fb2-music-object${selected?' selected':''}`} style={{...style, background:item.fill || '#fff'}} onPointerDown={onSelect} onPointerMove={onMove} onPointerUp={onEnd}><div className="fb2-keyboard">{Array.from({length:14},(_,index)=><i key={index}/>) }{[1,2,4,5,6,8,9,11,12,13].map(index => <b key={index} style={{left:`${index/14*100}%`}}/>)}</div></div>;
  return <div className={`fb2-object fb2-${item.type}${selected ? ' selected' : ''}`} style={style} onPointerDown={onSelect} onPointerMove={onMove} onPointerUp={onEnd}>
    <div contentEditable suppressContentEditableWarning onPointerDown={event => { if (tool === 'select' && selected) event.stopPropagation(); }} onBlur={event => onText(event.currentTarget.innerText)}>{item.text}</div>
  </div>;
}

function SelectionBox({ item, onResize }: { item: BoardObject; onResize: (event: ReactPointerEvent<HTMLButtonElement>, handle: 'nw'|'ne'|'sw'|'se') => void }) {
  return <div className="fb2-selection-box" style={{left:item.x,top:item.y,width:item.width,height:item.height,zIndex:item.zIndex+1000}}>
    {(['nw','ne','sw','se'] as const).map(handle => <button key={handle} className={handle} onPointerDown={event => onResize(event,handle)}/>) }
  </div>;
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
