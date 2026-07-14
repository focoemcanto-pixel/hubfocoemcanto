'use client';

import { FormEvent, useState } from 'react';
import { ExternalLink, Plus, ShoppingBag } from 'lucide-react';

type Offer = {
  id: string;
  name: string;
  headline: string | null;
  description: string | null;
  price: string | null;
  old_price: string | null;
  checkout_url: string;
  cta_label: string;
  image_url: string | null;
  badge: string | null;
};

export default function OffersClient({ initialOffers }: { initialOffers: Offer[] }) {
  const [offers, setOffers] = useState(initialOffers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/admin/foco-live/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        headline: form.get('headline'),
        description: form.get('description'),
        price: form.get('price'),
        oldPrice: form.get('oldPrice'),
        checkoutUrl: form.get('checkoutUrl'),
        ctaLabel: form.get('ctaLabel'),
        imageUrl: form.get('imageUrl'),
        badge: form.get('badge'),
      }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error || 'Não foi possível salvar a oferta.');
    setOffers((current) => [result.offer, ...current]);
    event.currentTarget.reset();
  }

  return (
    <div className="foco-live-grid">
      <form className="foco-live-panel foco-live-form" onSubmit={submit}>
        <div className="foco-live-panel-head"><div><span className="foco-live-kicker">Nova oferta</span><h2>Cadastre uma vez. Use em várias lives.</h2></div><Plus /></div>
        <div className="foco-live-form-grid">
          <label><span>Nome da oferta</span><input name="name" required placeholder="Foco em Canto Essencial" /></label>
          <label><span>Selo</span><input name="badge" placeholder="Oferta especial" /></label>
          <label className="full"><span>Headline</span><input name="headline" placeholder="Domine sua voz com segurança e consciência" /></label>
          <label className="full"><span>Descrição</span><textarea name="description" rows={3} placeholder="Resumo curto da transformação e da condição especial." /></label>
          <label><span>Preço atual</span><input name="price" placeholder="R$ 397" /></label>
          <label><span>Preço anterior</span><input name="oldPrice" placeholder="R$ 597" /></label>
          <label className="full"><span>Link de compra</span><input name="checkoutUrl" type="url" required placeholder="https://..." /></label>
          <label><span>Texto do botão</span><input name="ctaLabel" defaultValue="Quero garantir minha vaga" /></label>
          <label><span>Imagem opcional</span><input name="imageUrl" type="url" placeholder="https://..." /></label>
        </div>
        {error && <p className="foco-live-error">{error}</p>}
        <div className="foco-live-actions"><button className="foco-live-primary" disabled={loading}>{loading ? 'Salvando...' : 'Salvar oferta'}</button></div>
      </form>

      <section className="foco-live-panel">
        <div className="foco-live-panel-head"><div><span className="foco-live-kicker">Biblioteca</span><h2>Ofertas disponíveis</h2></div><ShoppingBag /></div>
        <div className="foco-live-scene-list">
          {offers.length === 0 ? <div className="foco-live-empty"><strong>Nenhuma oferta cadastrada.</strong><p>Crie a primeira para usá-la em suas transmissões.</p></div> : offers.map((offer) => (
            <a href={offer.checkout_url} target="_blank" rel="noreferrer" key={offer.id}>
              <b>{offer.name.slice(0, 2).toUpperCase()}</b>
              <span><strong>{offer.name}</strong><small>{offer.price || offer.headline || 'Oferta pronta para exibir'}</small></span>
              <ExternalLink size={17} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
