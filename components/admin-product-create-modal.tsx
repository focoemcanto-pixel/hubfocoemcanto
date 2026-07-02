'use client';

import { useEffect, useMemo, useState } from 'react';

type Props = {
  action: string | ((formData: FormData) => void | Promise<void>);
};

export function AdminProductCreateModal({ action: _action }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [filePreview, setFilePreview] = useState('');

  useEffect(() => {
    return () => {
      if (filePreview.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  const previewSrc = filePreview || coverUrl.trim();
  const previewTitle = useMemo(() => name.trim() || 'Novo Produto', [name]);
  const previewDescription = useMemo(() => description.trim() || 'Prévia da capa e do card do produto.', [description]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (filePreview.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    setFilePreview(file ? URL.createObjectURL(file) : '');
  }

  return (
    <div className="product-create-backdrop">
      <section className="product-create-modal">
        <div className="product-modal-head">
          <div>
            <span className="admin-clean-eyebrow">Novo produto</span>
            <h2>Criar produto</h2>
            <p>Crie um produto igual aos cards existentes: capa, status, preço, destino e curso vinculado.</p>
          </div>
          <label className="product-modal-close" htmlFor="create-product-toggle">×</label>
        </div>

        <form className="product-create-grid" action="/admin/produtos/criar" method="post" encType="multipart/form-data">
          <div className="product-create-form">
            <label>Nome do produto
              <input name="name" placeholder="Ex: Workshop de Afinação" required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>Slug opcional
              <input name="slug" placeholder="workshop-afinacao" />
            </label>
            <label>Tipo
              <select name="type" defaultValue="course">
                <option value="course">Curso</option>
                <option value="subscription">Assinatura</option>
                <option value="workshop">Workshop</option>
                <option value="ebook">Ebook/Guia</option>
              </select>
            </label>
            <label>Tipo de pagamento
              <select name="billing_type" defaultValue="one_time">
                <option value="one_time">Pagamento único</option>
                <option value="recurring">Assinatura recorrente</option>
              </select>
            </label>
            <label>Status inicial
              <select name="status" defaultValue="draft">
                <option value="draft">Bloqueado/VIP</option>
                <option value="published">Liberado na Home</option>
              </select>
            </label>
            <label>Preço
              <input name="price" type="number" min="0" step="0.01" placeholder="97.00" />
            </label>
            <label className="wide">Descrição
              <textarea name="description" placeholder="Explique a transformação do produto." value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="wide">URL da capa
              <input name="cover_url" placeholder="https://.../capa.png" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} />
            </label>
            <label className="wide">Destino/checkout URL
              <input name="redirect_url" placeholder="https://pay.kiwify.com.br/... ou página interna" />
            </label>
            <button className="submit" type="submit">Criar produto</button>
          </div>

          <aside className="product-cover-panel">
            <span className="label">Capa do produto</span>
            <div className={`product-cover-preview ${previewSrc ? 'has-image' : ''}`}>
              {previewSrc ? <img src={previewSrc} alt="Prévia da capa" /> : <strong>{previewTitle}</strong>}
            </div>
            <div className="product-card-mini-preview">
              <div className="mini-cover" style={previewSrc ? { backgroundImage: `url(${previewSrc})` } : undefined} />
              <div>
                <strong>{previewTitle}</strong>
                <p>{previewDescription}</p>
              </div>
            </div>
            <p>Recomendado: imagem vertical 1080×1350 ou 4:5. A imagem será enviada para o mesmo Storage usado pelos demais produtos.</p>
            <label className="product-cover-upload">Enviar capa
              <input name="cover_file" type="file" accept="image/*" onChange={handleFileChange} />
            </label>
          </aside>
        </form>
      </section>
    </div>
  );
}
