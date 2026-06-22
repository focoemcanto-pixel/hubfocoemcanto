'use client';

import { useEffect, useState } from 'react';

type Props = {
  initialUrl?: string | null;
  fallback: string;
};

export function AdminProductCoverPreview({ initialUrl, fallback }: Props) {
  const [preview, setPreview] = useState(initialUrl || '');

  useEffect(() => {
    return () => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview((old) => {
      if (old.startsWith('blob:')) URL.revokeObjectURL(old);
      return url;
    });
  }

  return (
    <aside className="product-cover-editor">
      <span className="admin-clean-eyebrow">Capa do produto</span>
      <div className="product-cover-preview live-preview">
        {preview ? <img src={preview} alt="Prévia da capa" /> : <strong>{fallback}</strong>}
      </div>
      <p>Recomendado: 1280x720 para vitrine e checkout. Ao escolher o arquivo, a prévia aparece aqui antes de salvar.</p>
      <label className="admin-upload-drop">
        Enviar capa
        <input name="cover_file" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} />
      </label>
      <label className="admin-clean-check"><input name="remove_cover" value="1" type="checkbox" /> Remover capa atual</label>
    </aside>
  );
}
