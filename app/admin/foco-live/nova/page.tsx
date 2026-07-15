'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

type Offer = {
  id: string;
  name: string;
  headline: string | null;
  price: string | null;
  badge: string | null;
};

export default function NovaLivePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingCard, setUploadingCard] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState('');
  const [error, setError] = useState('');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/admin/foco-live/offers')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as ofertas.');
        setOffers(result.offers || []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as ofertas.'));
  }, []);

  function toggleOffer(id: string) {
    setSelectedOfferIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function uploadShareCard(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingCard(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('slug', slug || slugify(title) || 'live');
      const response = await fetch('/api/admin/foco-live/share-card-upload', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o card.');
      setShareImageUrl(result.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o card.');
    } finally {
      setUploadingCard(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get('startsAt') || '');
    const response = await fetch('/api/admin/foco-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        slug,
        description: String(form.get('description') || ''),
        accessType: String(form.get('accessType') || 'public'),
        guestAccessEnabled: form.get('guestAccessEnabled') === 'on',
        recordingEnabled: form.get('recordingEnabled') === 'on',
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        offerIds: selectedOfferIds,
        shareImageUrl: shareImageUrl || null,
      }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error || 'Não foi possível criar a live.');
    router.push(`/admin/foco-live/${result.live.id}`);
    router.refresh();
  }

  return (
    <main className="foco-live-admin">
      <section className="foco-live-hero">
        <div><span className="foco-live-kicker">Nova transmissão</span><h1>Crie uma sala com a sua marca.</h1><p>Defina o acesso, prepare as ofertas e gere automaticamente a sala privada na Daily.</p></div>
        <a className="foco-live-secondary" href="/admin/foco-live">← Voltar</a>
      </section>

      <form className="foco-live-panel foco-live-form" onSubmit={submit}>
        <div className="foco-live-form-grid">
          <label><span>Título da live</span><input required minLength={3} value={title} onChange={(event) => { const value = event.target.value; setTitle(value); if (!slug || slug === slugify(title)) setSlug(slugify(value)); }} placeholder="Live semanal — Extensão vocal" /></label>
          <label><span>Link personalizado</span><div className="foco-live-slug"><small>/live/</small><input required value={slug} onChange={(event) => setSlug(slugify(event.target.value))} placeholder="extensao-vocal" /></div></label>
          <label className="full"><span>Descrição</span><textarea name="description" rows={4} placeholder="O que será entregue nesta transmissão?" /></label>
          <label><span>Data e horário</span><input name="startsAt" type="datetime-local" /></label>
          <label><span>Tipo de acesso</span><select name="accessType" defaultValue="hybrid"><option value="public">Pública</option><option value="hybrid">Híbrida: alunos e convidados</option><option value="restricted">Restrita: somente alunos</option></select></label>
        </div>

        <section className="foco-live-panel" style={{ marginTop: 22 }}>
          <div className="foco-live-panel-head">
            <div><span className="foco-live-kicker">Card de compartilhamento</span><h2>A imagem que aparece no WhatsApp</h2><p>Envie um card horizontal, preferencialmente 1200 × 630 px. Sem imagem, a live usa automaticamente a identidade visual do site.</p></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: shareImageUrl ? 'minmax(260px, .8fr) 1fr' : '1fr', gap: 18, alignItems: 'center' }}>
            {shareImageUrl && <img src={shareImageUrl} alt="Prévia do card da live" style={{ display: 'block', width: '100%', aspectRatio: '1200 / 630', objectFit: 'cover', borderRadius: 18, border: '1px solid rgba(255,255,255,.1)' }} />}
            <div style={{ display: 'grid', gap: 10 }}>
              <label className="foco-live-secondary" style={{ display: 'inline-flex', width: 'fit-content', cursor: uploadingCard ? 'wait' : 'pointer' }}>
                {uploadingCard ? 'Enviando card...' : shareImageUrl ? 'Trocar card da live' : 'Enviar card da live'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadShareCard} disabled={uploadingCard} hidden />
              </label>
              {shareImageUrl && <button type="button" className="foco-live-secondary" style={{ width: 'fit-content' }} onClick={() => setShareImageUrl('')}>Usar a imagem padrão do site</button>}
              <small style={{ color: '#9f95a8' }}>O título e a descrição da live também serão usados na prévia compartilhada.</small>
            </div>
          </div>
        </section>

        <section className="foco-live-panel" style={{ marginTop: 22 }}>
          <div className="foco-live-panel-head">
            <div><span className="foco-live-kicker">Ofertas desta live</span><h2>Deixe os pitches preparados</h2><p>Marque as ofertas que poderão ser ativadas durante a transmissão. Você decide ao vivo se quer exibir.</p></div>
            <a className="foco-live-secondary" href="/admin/foco-live/ofertas" target="_blank" rel="noreferrer">Gerenciar biblioteca</a>
          </div>
          <div className="foco-live-scene-list">
            {offers.length === 0 ? (
              <div className="foco-live-empty"><strong>Nenhuma oferta cadastrada.</strong><p>Crie uma oferta na biblioteca. A live também pode ser criada sem ofertas.</p></div>
            ) : offers.map((offer) => {
              const selected = selectedOfferIds.includes(offer.id);
              return (
                <button type="button" key={offer.id} onClick={() => toggleOffer(offer.id)} style={{ borderColor: selected ? 'rgba(171,91,255,.65)' : undefined, background: selected ? 'rgba(151,67,245,.14)' : undefined }}>
                  <b>{selected ? '✓' : '+'}</b>
                  <span><strong>{offer.name}</strong><small>{offer.price || offer.headline || offer.badge || 'Oferta disponível'}</small></span>
                  <em>{selected ? 'Selecionada' : 'Adicionar'}</em>
                </button>
              );
            })}
          </div>
        </section>

        <div className="foco-live-toggles">
          <label><input name="guestAccessEnabled" type="checkbox" defaultChecked /><span><strong>Permitir convidados</strong><small>Entrada rápida sem cadastro obrigatório</small></span></label>
          <label><input name="recordingEnabled" type="checkbox" /><span><strong>Gravar na nuvem</strong><small>A gravação é cobrada separadamente pela Daily</small></span></label>
        </div>
        {error && <p className="foco-live-error">{error}</p>}
        <div className="foco-live-actions"><button className="foco-live-primary" disabled={loading || uploadingCard} type="submit">{loading ? 'Criando sala...' : 'Criar live e gerar link'}</button></div>
      </form>
    </main>
  );
}
