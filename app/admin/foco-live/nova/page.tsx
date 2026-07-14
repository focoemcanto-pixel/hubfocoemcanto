'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function NovaLivePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error || 'Não foi possível criar a live.');
    router.push('/admin/foco-live');
    router.refresh();
  }

  return (
    <main className="foco-live-admin">
      <section className="foco-live-hero">
        <div><span className="foco-live-kicker">Nova transmissão</span><h1>Crie uma sala com a sua marca.</h1><p>Defina o acesso, programe a data e gere automaticamente a sala privada na Daily.</p></div>
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
        <div className="foco-live-toggles">
          <label><input name="guestAccessEnabled" type="checkbox" defaultChecked /><span><strong>Permitir convidados</strong><small>Entrada rápida sem cadastro obrigatório</small></span></label>
          <label><input name="recordingEnabled" type="checkbox" /><span><strong>Gravar na nuvem</strong><small>A gravação é cobrada separadamente pela Daily</small></span></label>
        </div>
        {error && <p className="foco-live-error">{error}</p>}
        <div className="foco-live-actions"><button className="foco-live-primary" disabled={loading} type="submit">{loading ? 'Criando sala...' : 'Criar live e gerar link'}</button></div>
      </form>
    </main>
  );
}
