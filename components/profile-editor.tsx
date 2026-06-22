'use client';

import { useRef, useState } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';

type Props = { name: string; username: string; bio: string; whatsapp: string; avatarUrl: string; initials: string };

export function ProfileEditor({ name, username, bio, whatsapp, avatarUrl, initials }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [preview, setPreview] = useState(avatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState('');
  const [cropFileName, setCropFileName] = useState('avatar.jpg');
  const [zoom, setZoom] = useState(1.08);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [formValues, setFormValues] = useState({ name, headline: username, bio, whatsapp });

  function chooseFile(next?: File) {
    if (!next) return;
    setCropFileName(next.name || 'avatar.jpg');
    setCropSource(URL.createObjectURL(next));
    setZoom(1.08); setX(50); setY(50);
    setStatus('idle'); setMessage('');
  }

  async function applyCrop() {
    const img = imageRef.current;
    if (!img) return;
    const size = 720;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const naturalWidth = img.naturalWidth || size;
    const naturalHeight = img.naturalHeight || size;
    const sourceSize = Math.min(naturalWidth, naturalHeight) / zoom;
    const maxX = naturalWidth - sourceSize;
    const maxY = naturalHeight - sourceSize;
    const sx = Math.max(0, Math.min(maxX, (x / 100) * maxX));
    const sy = Math.max(0, Math.min(maxY, (y / 100) * maxY));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return;
    const cropped = new File([blob], cropFileName.replace(/\.[^.]+$/, '') + '-perfil.jpg', { type: 'image/jpeg' });
    setFile(cropped);
    setPreview(URL.createObjectURL(cropped));
    setCropSource('');
    setMessage('Foto enquadrada. Salve para aplicar no perfil.');
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
    setFormValues({
      name: data.name || String(form.get('name') || ''),
      headline: data.headline || String(form.get('headline') || ''),
      bio: data.bio || String(form.get('bio') || ''),
      whatsapp: data.whatsapp || String(form.get('whatsapp') || ''),
    });
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
    setStatus('saved');
    setMessage('Perfil salvo. As alterações já foram aplicadas.');
    window.setTimeout(() => setStatus('idle'), 1600);
  }

  return (
    <>
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
      </form>
      {cropSource ? <div className="ig-crop-modal"><div className="ig-crop-sheet"><header><button type="button" onClick={() => setCropSource('')}><X size={22} /></button><strong>Editar foto</strong><button type="button" onClick={applyCrop}>Concluir</button></header><div className="ig-crop-stage"><div className="ig-crop-circle"><img ref={imageRef} src={cropSource} alt="Enquadrar foto" style={{ transform: `scale(${zoom})`, objectPosition: `${x}% ${y}%` }} /></div></div><div className="ig-crop-controls"><label>Zoom<input type="range" min="1" max="2.6" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><label>Horizontal<input type="range" min="0" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} /></label><label>Vertical<input type="range" min="0" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} /></label></div></div></div> : null}
    </>
  );
}
