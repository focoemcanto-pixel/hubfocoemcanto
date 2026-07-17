'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function NovaLivePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingCard, setUploadingCard] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState('');
  const [error, setError] = useState('');

  async function uploadShareCard(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingCard(true); setError('');
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
    } finally { setUploadingCard(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get('startsAt') || '');
    if (!startsAt) { setLoading(false); return setError('Defina a data e o horário da transmissão.'); }
    const response = await fetch('/api/admin/foco-live', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, slug, creationMode: 'scheduled',
        description: String(form.get('description') || ''),
        accessType: String(form.get('accessType') || 'public'),
        guestAccessEnabled: form.get('guestAccessEnabled') === 'on',
        recordingEnabled: form.get('recordingEnabled') === 'on',
        startsAt: new Date(startsAt).toISOString(),
        shareImageUrl: shareImageUrl || null,
      }),
    });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setError(result.error || 'Não foi possível criar a live.');
    router.push(`/admin/foco-live/${result.live.id}`); router.refresh();
  }

  return <main className="foco-live-admin">
    <section className="foco-live-hero"><div><span className="foco-live-kicker">Agendar transmissão</span><h1>Prepare o evento e gere o convite completo.</h1><p>Defina tema, descrição, imagem, data e acesso. Depois você poderá editar tudo pela página da Live.</p></div><a className="foco-live-secondary" href="/admin/foco-live">← Voltar</a></section>
    <form className="foco-live-panel foco-live-form" onSubmit={submit}>
      <div className="foco-live-form-grid">
        <label><span>Título da live</span><input required minLength={3} value={title} onChange={(event) => { const value=event.target.value; setTitle(value); if(!slug||slug===slugify(title)) setSlug(slugify(value)); }} placeholder="Quarta Vocal"/></label>
        <label><span>Link personalizado</span><div className="foco-live-slug"><small>/live/</small><input required value={slug} onChange={(event)=>setSlug(slugify(event.target.value))} placeholder="quarta-vocal"/></div></label>
        <label className="full"><span>Descrição</span><textarea name="description" rows={5} placeholder="Tema, promessa e o que será entregue nesta transmissão."/></label>
        <label><span>Data e horário</span><input name="startsAt" type="datetime-local" required/></label>
        <label><span>Tipo de acesso</span><select name="accessType" defaultValue="public"><option value="public">Pública</option><option value="hybrid">Híbrida</option><option value="restricted">Restrita</option></select></label>
      </div>
      <section className="foco-live-panel" style={{marginTop:22}}><div className="foco-live-panel-head"><div><span className="foco-live-kicker">Imagem do convite</span><h2>Card para WhatsApp e redes sociais</h2><p>Use uma imagem horizontal 1200 × 630 px.</p></div></div><div style={{display:'grid',gridTemplateColumns:shareImageUrl?'minmax(260px,.8fr) 1fr':'1fr',gap:18,alignItems:'center'}}>{shareImageUrl&&<img src={shareImageUrl} alt="Prévia" style={{width:'100%',aspectRatio:'1200/630',objectFit:'cover',borderRadius:18}}/>}<div style={{display:'grid',gap:10}}><label className="foco-live-secondary" style={{display:'inline-flex',width:'fit-content',cursor:'pointer'}}>{uploadingCard?'Enviando…':shareImageUrl?'Trocar imagem':'Enviar imagem'}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadShareCard}/></label>{shareImageUrl&&<button type="button" className="foco-live-secondary" style={{width:'fit-content'}} onClick={()=>setShareImageUrl('')}>Remover imagem</button>}</div></div></section>
      <section className="foco-live-panel" style={{marginTop:22}}><div className="foco-live-panel-head"><div><span className="foco-live-kicker">Biblioteca global</span><h2>Ofertas não precisam ser vinculadas</h2><p>Todas as ofertas ativas da biblioteca estarão disponíveis no painel Direção da transmissão. Você escolhe ao vivo qual deseja mostrar.</p></div><a className="foco-live-secondary" href="/admin/foco-live/ofertas" target="_blank">Abrir biblioteca</a></div></section>
      <div className="foco-live-toggles"><label><input name="guestAccessEnabled" type="checkbox" defaultChecked/><span><strong>Permitir convidados</strong><small>Entrada rápida pelo link público</small></span></label><label><input name="recordingEnabled" type="checkbox"/><span><strong>Gravar na nuvem</strong><small>Quando disponível no plano Daily</small></span></label></div>
      {error&&<p className="foco-live-error">{error}</p>}<div className="foco-live-actions"><button className="foco-live-primary" disabled={loading||uploadingCard} type="submit">{loading?'Agendando…':'Agendar live e gerar convite'}</button></div>
    </form>
  </main>;
}
