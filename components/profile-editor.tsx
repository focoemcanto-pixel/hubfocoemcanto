'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, Loader2, RotateCcw, Trash2, X } from 'lucide-react';

type Props = { name: string; username: string; bio: string; whatsapp: string; avatarUrl: string; initials: string };
type Point = { x: number; y: number };

const cropCss = `.ig-crop-modal{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.72);backdrop-filter:blur(18px);display:grid;place-items:end center}.ig-crop-sheet{width:min(100%,560px);max-height:92vh;overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:34px 34px 0 0;background:#07070d;color:#fff;box-shadow:0 -24px 100px rgba(0,0,0,.55);padding:18px 22px 28px}.ig-crop-sheet header{display:grid;grid-template-columns:56px 1fr 84px;align-items:center;gap:10px;margin-bottom:24px}.ig-crop-sheet header strong{text-align:center;font-size:24px;letter-spacing:-.03em}.ig-crop-sheet header button{border:0;background:transparent;color:#fff;font-weight:900;font-size:16px;padding:10px;border-radius:14px}.ig-crop-sheet header button:last-child{color:#2d9cff}.ig-crop-stage{display:grid;place-items:center;padding:8px 0 18px}.ig-crop-circle{position:relative;width:min(78vw,340px);height:min(78vw,340px);border-radius:50%;overflow:hidden;border:4px solid #fff;background:#111;touch-action:none;user-select:none;cursor:grab;box-shadow:0 24px 80px rgba(0,0,0,.36)}.ig-crop-circle:active{cursor:grabbing}.ig-crop-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;will-change:transform;transform-origin:center center;-webkit-user-drag:none;user-select:none;pointer-events:none}.ig-crop-help{text-align:center;color:rgba(255,255,255,.64);font-weight:750;line-height:1.45;margin:6px auto 0;max-width:340px}.ig-crop-actions{display:flex;justify-content:center;gap:10px;margin-top:16px}.ig-crop-soft-button{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.06);color:#fff;padding:11px 14px;font-weight:900}.ig-crop-mask-hint{position:absolute;inset:10px;border-radius:50%;border:1px solid rgba(255,255,255,.38);pointer-events:none}.ig-crop-safe-area{height:18px}.ig-danger-zone{margin:28px 0 0;border-top:1px solid rgba(255,255,255,.09);padding-top:18px}.ig-danger-zone>button{width:100%;border:1px solid rgba(255,255,255,.10);border-radius:18px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.74);padding:15px 16px;display:flex;align-items:center;gap:12px;text-align:left}.ig-danger-zone svg{color:rgba(255,204,102,.72);flex:0 0 auto}.ig-danger-zone strong{display:block;color:rgba(255,255,255,.86);font-size:15px}.ig-danger-zone small{display:block;margin-top:4px;color:rgba(255,255,255,.45);line-height:1.35}.ig-delete-modal{position:fixed;inset:0;z-index:130;background:rgba(0,0,0,.72);backdrop-filter:blur(18px);display:grid;place-items:end center}.ig-delete-sheet{width:min(100%,560px);border:1px solid rgba(255,255,255,.14);border-radius:34px 34px 0 0;background:#07070d;color:#fff;box-shadow:0 -24px 100px rgba(0,0,0,.55);padding:20px 22px calc(24px + env(safe-area-inset-bottom))}.ig-delete-sheet header{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px}.ig-delete-sheet h2{margin:0;font-size:25px;letter-spacing:-.04em}.ig-delete-sheet header button{border:0;background:transparent;color:#fff;padding:8px}.ig-delete-warning{display:flex;gap:12px;border:1px solid rgba(255,83,83,.28);border-radius:20px;background:rgba(255,83,83,.08);padding:15px;margin:14px 0;color:#ffd1d1}.ig-delete-warning svg{color:#ff6b6b;flex:0 0 auto}.ig-delete-warning p{margin:0;line-height:1.45}.ig-delete-list{margin:16px 0;padding:0;list-style:none;display:grid;gap:7px;color:rgba(255,255,255,.65);font-size:14px}.ig-delete-list li:before{content:'✓';color:#ff7676;margin-right:8px}.ig-delete-confirm{display:grid;gap:8px;margin-top:14px}.ig-delete-confirm span{font-weight:900;color:rgba(255,255,255,.68)}.ig-delete-confirm input{height:52px;border:1px solid rgba(255,255,255,.13);border-radius:16px;background:rgba(255,255,255,.045);color:#fff;padding:0 14px;font-size:17px;font-weight:900;text-transform:uppercase;outline:none}.ig-delete-actions{display:grid;grid-template-columns:1fr 1.2fr;gap:10px;margin-top:18px}.ig-delete-actions button{height:54px;border-radius:999px;font-weight:950;border:1px solid rgba(255,255,255,.12)}.ig-delete-actions button:first-child{background:rgba(255,255,255,.06);color:#fff}.ig-delete-permanent{background:#ff4d4d;color:#fff;border-color:#ff4d4d!important}.ig-delete-permanent:disabled{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.10)!important;color:rgba(255,255,255,.32)}.ig-delete-status{margin:12px 0 0;color:#ffb6b6;font-weight:800}.ig-delete-status.ok{color:#74e68b}@media(min-width:720px){.ig-crop-modal,.ig-delete-modal{place-items:center}.ig-crop-sheet,.ig-delete-sheet{border-radius:34px;max-height:90vh}}@media(max-width:520px){.ig-crop-sheet,.ig-delete-sheet{padding:16px 18px 26px}.ig-crop-sheet header{grid-template-columns:44px 1fr 78px}.ig-crop-sheet header strong{font-size:21px}.ig-crop-circle{width:min(82vw,340px);height:min(82vw,340px)}.ig-delete-actions{grid-template-columns:1fr}.ig-delete-actions button:first-child{order:2}}`;

export function ProfileEditor({ name, username, bio, whatsapp, avatarUrl, initials }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const circleRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ start: Point; position: Point } | null>(null);
  const touchRef = useRef<{ distance: number; zoom: number; position: Point; center: Point } | null>(null);
  const lastTapRef = useRef(0);
  const [preview, setPreview] = useState(avatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState('');
  const [cropFileName, setCropFileName] = useState('avatar.jpg');
  const [zoom, setZoom] = useState(1.08);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [formValues, setFormValues] = useState({ name, headline: username, bio, whatsapp });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'done' | 'error'>('idle');
  const [deleteMessage, setDeleteMessage] = useState('');

  function clampZoom(value: number) { return Math.max(1, Math.min(3.2, value)); }
  function clampPosition(next: Point, nextZoom = zoom) {
    const circle = circleRef.current;
    const size = circle?.clientWidth || 340;
    const limit = (size * (nextZoom - 1)) / 2 + 70;
    return { x: Math.max(-limit, Math.min(limit, next.x)), y: Math.max(-limit, Math.min(limit, next.y)) };
  }
  function resetCrop() { setZoom(1.08); setPosition({ x: 0, y: 0 }); }
  function touchPoint(touch: React.Touch) { return { x: touch.clientX, y: touch.clientY }; }
  function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function midpoint(a: Point, b: Point) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function chooseFile(next?: File) {
    if (!next) return;
    setCropFileName(next.name || 'avatar.jpg');
    setCropSource(URL.createObjectURL(next));
    resetCrop();
    setStatus('idle'); setMessage('');
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) { if (event.pointerType === 'touch') return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { start: { x: event.clientX, y: event.clientY }, position }; }
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) { if (!dragRef.current || event.pointerType === 'touch') return; const dx = event.clientX - dragRef.current.start.x; const dy = event.clientY - dragRef.current.start.y; setPosition(clampPosition({ x: dragRef.current.position.x + dx, y: dragRef.current.position.y + dy })); }
  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) { if (event.pointerType !== 'touch') dragRef.current = null; }
  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) { const now = Date.now(); if (event.touches.length === 1) { const point = touchPoint(event.touches[0]); dragRef.current = { start: point, position }; if (now - lastTapRef.current < 280) resetCrop(); lastTapRef.current = now; } if (event.touches.length === 2) { event.preventDefault(); const a = touchPoint(event.touches[0]); const b = touchPoint(event.touches[1]); touchRef.current = { distance: distance(a, b), zoom, position, center: midpoint(a, b) }; } }
  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) { if (event.touches.length === 2 && touchRef.current) { event.preventDefault(); const a = touchPoint(event.touches[0]); const b = touchPoint(event.touches[1]); const center = midpoint(a, b); const nextZoom = clampZoom(touchRef.current.zoom * (distance(a, b) / touchRef.current.distance)); const nextPosition = clampPosition({ x: touchRef.current.position.x + (center.x - touchRef.current.center.x), y: touchRef.current.position.y + (center.y - touchRef.current.center.y) }, nextZoom); setZoom(nextZoom); setPosition(nextPosition); return; } if (event.touches.length === 1 && dragRef.current) { event.preventDefault(); const point = touchPoint(event.touches[0]); setPosition(clampPosition({ x: dragRef.current.position.x + point.x - dragRef.current.start.x, y: dragRef.current.position.y + point.y - dragRef.current.start.y })); } }
  function handleTouchEnd() { dragRef.current = null; touchRef.current = null; }
  function handleWheel(event: React.WheelEvent<HTMLDivElement>) { event.preventDefault(); const nextZoom = clampZoom(zoom + (event.deltaY > 0 ? -0.08 : 0.08)); setZoom(nextZoom); setPosition((current) => clampPosition(current, nextZoom)); }

  async function applyCrop() {
    const img = imageRef.current;
    const circle = circleRef.current;
    if (!img || !circle) return;
    const outputSize = 720;
    const stageSize = circle.clientWidth || 340;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize; canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const naturalWidth = img.naturalWidth || outputSize;
    const naturalHeight = img.naturalHeight || outputSize;
    const baseScale = Math.max(stageSize / naturalWidth, stageSize / naturalHeight);
    const drawScale = baseScale * zoom * (outputSize / stageSize);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, outputSize, outputSize);
    ctx.save();
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(outputSize / 2 + position.x * (outputSize / stageSize), outputSize / 2 + position.y * (outputSize / stageSize));
    ctx.scale(drawScale, drawScale);
    ctx.drawImage(img, -naturalWidth / 2, -naturalHeight / 2);
    ctx.restore();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return;
    const cropped = new File([blob], cropFileName.replace(/\.[^.]+$/, '') + '-perfil.jpg', { type: 'image/jpeg' });
    setFile(cropped);
    setPreview(URL.createObjectURL(cropped));
    setCropSource('');
    setMessage('Foto pronta. Toque em salvar para aplicar no perfil.');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (file) form.set('avatar', file);
    setStatus('saving');
    setMessage('Salvando perfil...');
    const response = await fetch('/api/profile', { method: 'POST', headers: { accept: 'application/json', 'x-requested-with': 'fetch' }, body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) { setStatus('error'); setMessage(data?.detail || data?.error || 'Não consegui salvar agora.'); return; }
    if (data.avatar_url) setPreview(data.avatar_url);
    setFormValues({ name: data.name || String(form.get('name') || ''), headline: data.headline || String(form.get('headline') || ''), bio: data.bio || String(form.get('bio') || ''), whatsapp: data.whatsapp || String(form.get('whatsapp') || '') });
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
    setStatus('saved');
    setMessage('Perfil salvo. As alterações já foram aplicadas.');
    window.setTimeout(() => setStatus('idle'), 1600);
  }

  async function deleteAccount() {
    if (deleteText.trim().toUpperCase() !== 'EXCLUIR') return;
    setDeleteStatus('deleting');
    setDeleteMessage('Excluindo sua conta...');
    const response = await fetch('/api/profile', { method: 'DELETE', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ confirmation: deleteText }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) { setDeleteStatus('error'); setDeleteMessage(data?.detail || data?.error || 'Não consegui excluir a conta agora.'); return; }
    setDeleteStatus('done');
    setDeleteMessage('Conta excluída. Redirecionando...');
    window.setTimeout(() => { window.location.href = data.redirect || '/login?conta=excluida'; }, 700);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cropCss }} />
      <form className="ig-edit-form" onSubmit={save}>
        <section className="ig-edit-avatar-block">
          <button className="ig-edit-avatar" type="button" onClick={() => inputRef.current?.click()}>
            {preview ? <img src={preview} alt="Foto de perfil" /> : <span>{initials}</span>}
            <b><Camera size={18} /></b>
          </button>
          <input ref={inputRef} className="ig-hidden-file" type="file" name="avatar" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
          <p>Toque na foto para trocar</p>
        </section>
        <section className="ig-edit-fields">
          <label>Nome<input name="name" value={formValues.name} onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))} placeholder="Seu nome" /></label>
          <label>Nome de usuário<input name="headline" value={formValues.headline} onChange={(event) => setFormValues((current) => ({ ...current, headline: event.target.value }))} placeholder="ex: marcoscruz" /></label>
          <label>Bio<textarea name="bio" value={formValues.bio} onChange={(event) => setFormValues((current) => ({ ...current, bio: event.target.value }))} placeholder="Conte sobre sua voz, ministério, objetivo e o que está treinando..." /></label>
          <label>WhatsApp<input name="whatsapp" value={formValues.whatsapp} onChange={(event) => setFormValues((current) => ({ ...current, whatsapp: event.target.value }))} placeholder="Opcional" /></label>
        </section>
        <button className={`ig-save-profile-button ${status}`} type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? <Loader2 size={17} className="spin" /> : status === 'saved' ? <Check size={17} /> : null}
          {status === 'saving' ? 'Salvando...' : status === 'saved' ? 'Salvo' : 'Salvar alterações'}
        </button>
        {message ? <p className={`ig-editor-status ${status}`}>{message}</p> : null}
        <section className="ig-danger-zone">
          <button type="button" onClick={() => { setDeleteOpen(true); setDeleteText(''); setDeleteStatus('idle'); setDeleteMessage(''); }}>
            <Trash2 size={18} />
            <span><strong>Excluir minha conta</strong><small>Remove permanentemente perfil, progresso, publicações e atividades.</small></span>
          </button>
        </section>
      </form>
      {cropSource ? (
        <div className="ig-crop-modal">
          <div className="ig-crop-sheet">
            <header><button type="button" onClick={() => setCropSource('')} aria-label="Cancelar"><X size={28} /></button><strong>Editar foto</strong><button type="button" onClick={applyCrop}>Concluir</button></header>
            <div className="ig-crop-stage">
              <div ref={circleRef} className="ig-crop-circle" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onWheel={handleWheel} onDoubleClick={resetCrop}>
                <img ref={imageRef} className="ig-crop-image" src={cropSource} alt="Enquadrar foto" style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})` }} />
                <span className="ig-crop-mask-hint" />
              </div>
              <p className="ig-crop-help">Arraste para posicionar. Use dois dedos para ampliar ou reduzir. Toque duas vezes para recentralizar.</p>
              <div className="ig-crop-actions"><button className="ig-crop-soft-button" type="button" onClick={resetCrop}><RotateCcw size={16} /> Reposicionar</button></div>
            </div>
            <div className="ig-crop-safe-area" />
          </div>
        </div>
      ) : null}
      {deleteOpen ? (
        <div className="ig-delete-modal">
          <section className="ig-delete-sheet">
            <header><h2>Excluir conta</h2><button type="button" onClick={() => deleteStatus === 'deleting' ? null : setDeleteOpen(false)} aria-label="Fechar"><X size={26} /></button></header>
            <div className="ig-delete-warning"><AlertTriangle size={24} /><p><strong>Essa ação é permanente.</strong><br />Seu acesso será encerrado e seus dados serão removidos do Hub Foco em Canto.</p></div>
            <ul className="ig-delete-list"><li>Perfil e foto</li><li>Publicações, comentários, curtidas e salvos</li><li>Duetos, avaliações e envios</li><li>Progresso, aulas, estudos e perfil vocal</li></ul>
            <label className="ig-delete-confirm"><span>Digite EXCLUIR para confirmar</span><input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="EXCLUIR" disabled={deleteStatus === 'deleting' || deleteStatus === 'done'} /></label>
            <div className="ig-delete-actions"><button type="button" onClick={() => setDeleteOpen(false)} disabled={deleteStatus === 'deleting'}>Cancelar</button><button className="ig-delete-permanent" type="button" onClick={deleteAccount} disabled={deleteText.trim().toUpperCase() !== 'EXCLUIR' || deleteStatus === 'deleting' || deleteStatus === 'done'}>{deleteStatus === 'deleting' ? 'Excluindo...' : 'Excluir permanentemente'}</button></div>
            {deleteMessage ? <p className={`ig-delete-status ${deleteStatus === 'done' ? 'ok' : ''}`}>{deleteMessage}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
