'use client';

import { useMemo, useRef, useState } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';

type Props = {
  moduleId: string;
  title: string;
  description: string;
  sortOrder: number;
  initialCoverUrl: string;
};

export function AdminModuleCoverUploader({ moduleId, title, description, sortOrder, initialCoverUrl }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl);
  const [previewUrl, setPreviewUrl] = useState(initialCoverUrl);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const buttonLabel = useMemo(() => {
    if (status === 'saving') return 'Salvando...';
    if (status === 'saved') return 'Capa salva';
    if (status === 'error') return 'Tentar novamente';
    return file ? 'Salvar nova capa' : 'Salvar capa';
  }, [file, status]);

  function onFileChange(nextFile?: File) {
    if (!nextFile) return;
    setFile(nextFile);
    setStatus('idle');
    setMessage('Prévia carregada. Clique em “Salvar nova capa” para publicar.');
    const localUrl = URL.createObjectURL(nextFile);
    setPreviewUrl(localUrl);
  }

  async function submit(removeCover = false) {
    setStatus('saving');
    setMessage(removeCover ? 'Removendo capa...' : 'Enviando capa...');

    const formData = new FormData();
    formData.set('title', title);
    formData.set('description', description || '');
    formData.set('sort_order', String(sortOrder || 1));
    formData.set('cover_url', removeCover ? '' : coverUrl);
    if (removeCover) formData.set('remove_cover', '1');
    if (!removeCover && file) formData.set('cover_file', file);

    const response = await fetch(`/admin/biblioteca/${moduleId}/salvar`, {
      method: 'POST',
      headers: { accept: 'application/json', 'x-requested-with': 'fetch' },
      body: formData,
    });

    let data: any = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok || !data.ok) {
      setStatus('error');
      setMessage(data.error || 'Não consegui salvar a capa agora.');
      return;
    }

    const nextCoverUrl = String(data.cover_url || '');
    setCoverUrl(nextCoverUrl);
    setPreviewUrl(nextCoverUrl);
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
    setStatus('saved');
    setMessage(removeCover ? 'Capa removida.' : 'Capa salva e aplicada no módulo.');
    window.setTimeout(() => setStatus('idle'), 1800);
  }

  return (
    <div className="premium-cover-uploader">
      <div className="premium-cover-preview">
        {previewUrl ? <img src={previewUrl} alt="Capa do módulo" /> : null}
        <div className="premium-cover-shade" />
        <div className="premium-cover-copy">
          <span>Segunda voz</span>
          <strong>{title}</strong>
          <p>Domine a técnica, explore sua harmonia.</p>
        </div>
        {status === 'saving' ? <div className="premium-cover-loading"><Loader2 className="spin" size={22} /> Salvando capa</div> : null}
      </div>

      <div className="premium-cover-actions premium-cover-actions-live">
        <label className="premium-cover-button">
          <Upload size={16} /> Escolher capa
          <input ref={inputRef} name="cover_file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onFileChange(event.target.files?.[0])} />
        </label>
        <button className="premium-cover-remove" type="button" onClick={() => submit(true)} disabled={status === 'saving' || (!coverUrl && !previewUrl)}><Trash2 size={16} /> Remover capa</button>
        <button className={`premium-cover-save ${status === 'saved' ? 'saved' : status === 'error' ? 'error' : ''}`} type="button" onClick={() => submit(false)} disabled={status === 'saving' || (!file && previewUrl === coverUrl)}>
          {status === 'saving' ? <Loader2 className="spin" size={16} /> : null}{buttonLabel}
        </button>
      </div>
      <p className={`premium-cover-status ${status}`}>{message || 'Proporção recomendada: 320x480 para cards verticais premium.'}</p>
    </div>
  );
}
