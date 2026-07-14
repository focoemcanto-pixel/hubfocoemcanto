'use client';

import { useState } from 'react';
import { Check, ShoppingBag } from 'lucide-react';

type Offer = {
  id: string;
  name: string;
  headline: string | null;
  price: string | null;
};

export default function OfferSelector({ liveId, offers, initialSelected }: { liveId: string; offers: Offer[]; initialSelected: string[] }) {
  const [selected, setSelected] = useState(initialSelected);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    const response = await fetch(`/api/admin/foco-live/${liveId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerIds: selected }),
    });
    const payload = await response.json();
    setSaving(false);
    setMessage(response.ok ? 'Ofertas desta live atualizadas.' : payload.error || 'Não foi possível salvar.');
  }

  return (
    <section className="foco-live-panel foco-live-list-panel">
      <div className="foco-live-panel-head">
        <div><span className="foco-live-kicker">Ofertas desta transmissão</span><h2>Escolha o que ficará disponível no Studio</h2></div>
        <ShoppingBag />
      </div>
      <div className="foco-live-scene-list">
        {offers.length === 0 ? (
          <a href="/admin/foco-live/ofertas"><b>+</b><span><strong>Cadastrar primeira oferta</strong><small>Crie produtos, links e CTAs reutilizáveis.</small></span></a>
        ) : offers.map((offer) => {
          const active = selected.includes(offer.id);
          return (
            <button type="button" key={offer.id} onClick={() => toggle(offer.id)} className={active ? 'active' : ''}>
              <b>{active ? <Check size={17} /> : offer.name.slice(0, 2).toUpperCase()}</b>
              <span><strong>{offer.name}</strong><small>{offer.price || offer.headline || 'Oferta pronta para exibição'}</small></span>
            </button>
          );
        })}
      </div>
      <div className="foco-live-actions">
        <a className="foco-live-secondary" href="/admin/foco-live/ofertas">Abrir biblioteca</a>
        <button className="foco-live-primary" type="button" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar ofertas da live'}</button>
      </div>
      {message && <p className="foco-live-kicker" style={{ marginTop: 14 }}>{message}</p>}
    </section>
  );
}
