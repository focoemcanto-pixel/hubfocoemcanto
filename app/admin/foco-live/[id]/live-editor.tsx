'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { CalendarDays, Copy, ExternalLink, Image as ImageIcon, MessageCircle, Save, Settings2, Share2, Users } from 'lucide-react';

type LiveData = {
  id: string; title: string; slug: string; description: string | null; status: string; access_type: string;
  guest_access_enabled: boolean; starts_at: string | null; recording_enabled: boolean; offer_config?: Record<string, any> | null;
};
type Tab = 'general' | 'interaction' | 'sharing' | 'advanced';

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value); const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function LiveEditor({ initialLive }: { initialLive: LiveData }) {
  const [live, setLive] = useState(initialLive);
  const [tab, setTab] = useState<Tab>('general');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const publicUrl = typeof window === 'undefined' ? `/live/${live.slug}` : `${window.location.origin}/live/${live.slug}`;
  const agendaUrl = `${publicUrl}/agendar`;
  const invitation = useMemo(() => {
    const when = live.starts_at ? new Date(live.starts_at).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Bahia' }) : 'Data a definir';
    return `🎙️ VOCÊ ESTÁ CONVIDADO!\n\n*${live.title}*\n${live.description ? `\n${live.description}\n` : ''}\n📅 ${when}\n\n📍 Participe por aqui:\n${publicUrl}\n\n📲 Adicione à sua agenda e ative o lembrete:\n${agendaUrl}\n\nNos vemos ao vivo! 🎤\nMarcos Cruz — Foco em Canto`;
  }, [live, publicUrl, agendaUrl]);

  function patch(key: keyof LiveData, value: any) { setLive((current) => ({ ...current, [key]: value })); }

  async function save(event?: FormEvent) {
    event?.preventDefault(); setSaving(true); setMessage('');
    const response = await fetch(`/api/admin/foco-live/${live.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      title: live.title, slug: live.slug, description: live.description || '', startsAt: live.starts_at, accessType: live.access_type,
      guestAccessEnabled: live.guest_access_enabled, recordingEnabled: live.recording_enabled, shareImageUrl: live.offer_config?.share_image_url || null,
    }) });
    const result = await response.json(); setSaving(false);
    setMessage(response.ok ? 'Alterações salvas.' : result.error || 'Não foi possível salvar.');
  }

  async function uploadCard(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(true); const form = new FormData(); form.append('file', file); form.append('slug', live.slug);
    const response = await fetch('/api/admin/foco-live/share-card-upload', { method: 'POST', body: form });
    const result = await response.json(); setUploading(false);
    if (!response.ok) return setMessage(result.error || 'Não foi possível enviar a imagem.');
    setLive((current) => ({ ...current, offer_config: { ...(current.offer_config || {}), share_image_url: result.url } }));
  }

  async function copy(text: string) { await navigator.clipboard.writeText(text); setMessage('Copiado!'); }

  return <main className="fl-edit-live">
    <header className="fl-edit-header"><div><span>EDITAR LIVE</span><h1>{live.title}</h1><p>Enriqueça o evento depois de criar o link. As ofertas são globais e ficam disponíveis automaticamente no Studio.</p></div><div><a href={`/live/${live.slug}?host=1`}>Entrar no estúdio</a><button onClick={() => save()} disabled={saving}><Save size={17}/>{saving ? 'Salvando…' : 'Salvar'}</button></div></header>
    <nav className="fl-edit-tabs"><button className={tab==='general'?'active':''} onClick={()=>setTab('general')}><CalendarDays/>Geral</button><button className={tab==='interaction'?'active':''} onClick={()=>setTab('interaction')}><Users/>Interação</button><button className={tab==='sharing'?'active':''} onClick={()=>setTab('sharing')}><Share2/>Divulgação</button><button className={tab==='advanced'?'active':''} onClick={()=>setTab('advanced')}><Settings2/>Avançado</button></nav>
    <section className="fl-edit-layout"><form className="fl-edit-card" onSubmit={save}>
      {tab==='general' && <div className="fl-edit-grid"><label>Título<input value={live.title} onChange={e=>patch('title',e.target.value)} required/></label><label>Link personalizado<div className="fl-slug-field"><span>/live/</span><input value={live.slug} onChange={e=>patch('slug',e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))}/></div></label><label className="full">Descrição<textarea rows={5} value={live.description||''} onChange={e=>patch('description',e.target.value)}/></label><label>Data e horário<input type="datetime-local" value={localDateTime(live.starts_at)} onChange={e=>patch('starts_at',e.target.value?new Date(e.target.value).toISOString():null)}/></label><label>Tipo de acesso<select value={live.access_type} onChange={e=>patch('access_type',e.target.value)}><option value="public">Pública</option><option value="hybrid">Híbrida</option><option value="restricted">Restrita</option></select></label><div className="full fl-card-upload">{live.offer_config?.share_image_url ? <img src={live.offer_config.share_image_url} alt="Card da live"/>:<div><ImageIcon/><span>Sem imagem personalizada</span></div>}<label className="upload-button">{uploading?'Enviando…':'Enviar imagem 1200 × 630'}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadCard}/></label></div></div>}
      {tab==='interaction' && <div className="fl-toggle-list"><label><input type="checkbox" checked={live.guest_access_enabled} onChange={e=>patch('guest_access_enabled',e.target.checked)}/><span><strong>Permitir convidados</strong><small>Entrada pelo link público.</small></span></label><label><input type="checkbox" defaultChecked/><span><strong>Chat</strong><small>Mensagens durante a transmissão.</small></span></label><label><input type="checkbox" defaultChecked/><span><strong>Levantar mão</strong><small>Sinalização visual para o host.</small></span></label><label><input type="checkbox" checked={live.recording_enabled} onChange={e=>patch('recording_enabled',e.target.checked)}/><span><strong>Gravação na nuvem</strong><small>Quando disponível no plano Daily.</small></span></label></div>}
      {tab==='sharing' && <div className="fl-sharing-editor"><h2>Convite pronto</h2><textarea readOnly rows={14} value={invitation}/><div><button type="button" onClick={()=>copy(invitation)}><Copy/>Copiar convite</button><button type="button" onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(invitation)}`,'_blank')}><MessageCircle/>WhatsApp</button></div><h3>Links do evento</h3><button type="button" className="link-row" onClick={()=>copy(publicUrl)}><span>{publicUrl}</span><Copy/></button><a className="link-row" href={agendaUrl} target="_blank"><span>{agendaUrl}</span><ExternalLink/></a></div>}
      {tab==='advanced' && <div className="fl-toggle-list"><label><span><strong>Status atual</strong><small>{live.status}</small></span></label><label><span><strong>Biblioteca de ofertas global</strong><small>Todas as ofertas ativas aparecem no painel Direção de qualquer live.</small></span><a href="/admin/foco-live/ofertas">Abrir biblioteca</a></label></div>}
      {message && <p className="fl-edit-message">{message}</p>}
    </form><aside className="fl-edit-summary"><span>RESUMO</span><h3>{live.title}</h3><p>{live.starts_at?new Date(live.starts_at).toLocaleString('pt-BR',{dateStyle:'full',timeStyle:'short'}):'Sem data definida'}</p><div><small>Status</small><strong>{live.status}</strong></div><div><small>Link</small><strong>/live/{live.slug}</strong></div><a href={`/live/${live.slug}?host=1`}>Entrar na sala</a><button onClick={()=>copy(invitation)}>Copiar convite</button></aside></section>
  </main>;
}
