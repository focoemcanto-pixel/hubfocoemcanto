'use client';

import { useRef, useState } from 'react';
import { Camera, Check, Loader2 } from 'lucide-react';

type Props = {
  name: string;
  username: string;
  bio: string;
  whatsapp: string;
  avatarUrl: string;
  initials: string;
};

export function ProfileEditor({ name, username, bio, whatsapp, avatarUrl, initials }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState(avatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  function chooseFile(next?: File) {
    if (!next) return;
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setStatus('idle');
    setMessage('Prévia atualizada. Salve para aplicar no perfil.');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (file) form.set('avatar', file);
    setStatus('saving');
    setMessage('Salvando perfil...');

    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { accept: 'application/json', 'x-requested-with': 'fetch' },
      body: form,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      setStatus('error');
      setMessage(data?.error || 'Não consegui salvar agora.');
      return;
    }
    if (data.avatar_url) setPreview(data.avatar_url);
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
    setStatus('saved');
    setMessage('Perfil salvo. A foto já foi aplicada.');
    window.setTimeout(() => setStatus('idle'), 1600);
  }

  return (
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
        <label>Nome<input name="name" defaultValue={name} placeholder="Seu nome" /></label>
        <label>Nome de usuário<input name="headline" defaultValue={username} placeholder="ex: marcoscruz" /></label>
        <label>Bio<textarea name="bio" defaultValue={bio} placeholder="Conte sobre sua voz, ministério, objetivo e o que está treinando..." /></label>
        <label>WhatsApp<input name="whatsapp" defaultValue={whatsapp} placeholder="Opcional" /></label>
      </section>

      <button className={`ig-save-profile-button ${status}`} type="submit" disabled={status === 'saving'}>
        {status === 'saving' ? <Loader2 size={17} className="spin" /> : status === 'saved' ? <Check size={17} /> : null}
        {status === 'saving' ? 'Salvando...' : status === 'saved' ? 'Salvo' : 'Salvar alterações'}
      </button>
      {message ? <p className={`ig-editor-status ${status}`}>{message}</p> : null}
    </form>
  );
}
