'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Clock3, ExternalLink, Eye, EyeOff, Link2, Play, Plus, Radio, Settings2, Sparkles, Star, Trash2, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';

type LiveRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  access_type: string;
  guest_access_enabled: boolean;
  replay_enabled: boolean;
  replay_is_current: boolean;
  replay_status: string;
  replay_published_at: string | null;
  drive_file_id: string | null;
};

type Props = { lives: LiveRow[] };
type Filter = 'all' | 'live' | 'scheduled' | 'draft' | 'ended';

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function statusLabel(status: string) {
  if (status === 'live') return 'Ao vivo';
  if (status === 'scheduled') return 'Agendada';
  if (status === 'ended') return 'Encerrada';
  return 'Rascunho';
}

function dateLabel(value: string | null) {
  if (!value) return 'Sem data definida';
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function FocoLiveDashboard({ lives: initialLives }: Props) {
  const router = useRouter();
  const [lives, setLives] = useState(initialLives);
  const [filter, setFilter] = useState<Filter>('all');
  const [newLiveOpen, setNewLiveOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [busy, setBusy] = useState<'later' | 'instant' | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const visibleLives = useMemo(() => filter === 'all' ? lives : lives.filter((live) => live.status === filter), [filter, lives]);
  const replayLives = useMemo(() => lives.filter((live) => live.drive_file_id || live.replay_enabled), [lives]);
  const counts = useMemo(() => ({
    live: lives.filter((item) => item.status === 'live').length,
    scheduled: lives.filter((item) => item.status === 'scheduled').length,
    draft: lives.filter((item) => item.status === 'draft').length,
    ended: lives.filter((item) => item.status === 'ended').length,
  }), [lives]);

  async function quickCreate(mode: 'later' | 'instant') {
    setBusy(mode); setError('');
    const baseTitle = quickTitle.trim() || (mode === 'instant' ? `Live instantânea ${new Date().toLocaleDateString('pt-BR')}` : 'Nova live');
    const slug = `${slugify(baseTitle) || 'live'}-${Date.now().toString(36)}`;
    try {
      const response = await fetch('/api/admin/foco-live', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: baseTitle, slug, creationMode: mode, description: '', accessType: 'public', guestAccessEnabled: true, recordingEnabled: false, startsAt: null, shareImageUrl: null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível criar a live.');
      if (mode === 'instant') window.location.href = `/live/${result.live.slug}?host=1`;
      else router.push(`/admin/foco-live/${result.live.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a live.');
      setBusy(null);
    }
  }

  async function deleteLive(live: LiveRow) {
    if (!window.confirm(`Apagar definitivamente “${live.title}”? Esta ação remove a transmissão da lista.`)) return;
    setActionBusy(`delete-${live.id}`); setError('');
    try {
      const response = await fetch(`/api/admin/foco-live/${live.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível apagar a live.');
      setLives((current) => current.filter((item) => item.id !== live.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível apagar a live.');
    } finally { setActionBusy(null); }
  }

  async function updateReplay(live: LiveRow, action: 'publish' | 'disable') {
    setActionBusy(`${action}-${live.id}`); setError('');
    try {
      const response = await fetch(`/api/admin/foco-live/${live.id}/replay`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar o replay.');
      setLives((current) => current.map((item) => {
        if (action === 'publish') {
          if (item.id === live.id) return { ...item, replay_enabled: true, replay_is_current: true, replay_status: 'published' };
          return { ...item, replay_is_current: false };
        }
        return item.id === live.id ? { ...item, replay_enabled: false, replay_is_current: false, replay_status: 'archived' } : item;
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o replay.');
    } finally { setActionBusy(null); }
  }

  return <main className="fl-admin-hub">
    <section className="fl-admin-top">
      <div><span>FOCO LIVE</span><h1>Transmissões simples de criar. Poderosas para ensinar e vender.</h1><p>Crie um link em segundos, inicie agora ou agende uma experiência completa com convite e calendário.</p></div>
      <button className="fl-new-live" onClick={() => setNewLiveOpen(true)}><Plus size={20}/> Nova Live</button>
    </section>

    <section className="fl-admin-shortcuts">
      <button onClick={() => setNewLiveOpen(true)}><Video/><span><strong>Nova Live</strong><small>Criar, iniciar ou agendar</small></span></button>
      <a href="/admin/foco-live/ofertas"><Sparkles/><span><strong>Biblioteca de ofertas</strong><small>Disponíveis em todas as transmissões</small></span></a>
      <a href="/admin/foco-live/configuracoes"><Settings2/><span><strong>Configurações</strong><small>Marca, padrões e permissões</small></span></a>
    </section>

    <section className="fl-admin-metrics">
      <article><Radio/><div><strong>{counts.live}</strong><span>Ao vivo</span></div></article>
      <article><CalendarDays/><div><strong>{counts.scheduled}</strong><span>Agendadas</span></div></article>
      <article><Clock3/><div><strong>{counts.draft}</strong><span>Rascunhos</span></div></article>
      <article><Video/><div><strong>{counts.ended}</strong><span>Encerradas</span></div></article>
    </section>

    <section className="fl-admin-list-panel fl-replay-manager">
      <header><div><span>REPLAYS</span><h2>Gerenciamento das aulas</h2><p>O fluxo continua automático, mas aqui você decide qual gravação fica ativa no link semanal.</p></div><a className="fl-replay-open" href="/replay" target="_blank" rel="noreferrer"><ExternalLink size={15}/> Abrir página</a></header>
      <div className="fl-admin-live-list">
        {replayLives.length === 0 ? <div className="fl-admin-empty"><Video size={34}/><strong>Nenhum replay gravado ainda.</strong><p>As gravações publicadas aparecerão aqui.</p></div> : replayLives.map((live) => <article key={`replay-${live.id}`}>
          <i className={live.replay_is_current ? 'status-live' : ''}/><div className="fl-live-info"><strong>{live.title}</strong><small>{live.replay_is_current ? 'Replay atual do link /replay' : live.replay_enabled ? 'Publicado, mas não é o atual' : 'Desativado'} · {dateLabel(live.replay_published_at)}</small></div>
          <span className={`fl-status-pill ${live.replay_is_current ? 'status-live' : ''}`}>{live.replay_is_current ? 'Atual' : live.replay_enabled ? 'Publicado' : 'Desativado'}</span>
          <div className="fl-live-row-actions">
            {!live.replay_is_current && <button disabled={Boolean(actionBusy)} onClick={() => updateReplay(live, 'publish')}><Star size={15}/> Tornar atual</button>}
            {live.replay_enabled && <button disabled={Boolean(actionBusy)} onClick={() => updateReplay(live, 'disable')}><EyeOff size={15}/> Desativar</button>}
            {!live.replay_enabled && live.drive_file_id && <button disabled={Boolean(actionBusy)} onClick={() => updateReplay(live, 'publish')}><Eye size={15}/> Ativar</button>}
            <a href={`/replay/${live.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a>
          </div>
        </article>)}
      </div>
    </section>

    <section className="fl-admin-list-panel">
      <header><div><span>TRANSMISSÕES</span><h2>Suas lives</h2></div><nav>{(['all','live','scheduled','draft','ended'] as Filter[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'Todas' : statusLabel(item)}</button>)}</nav></header>
      <div className="fl-admin-live-list">
        {visibleLives.length === 0 ? <div className="fl-admin-empty"><Video size={34}/><strong>Nenhuma transmissão neste filtro.</strong><p>Use “Nova Live” para começar.</p></div> : visibleLives.map((live) => <article key={live.id}>
          <i className={`status-${live.status}`}/><div className="fl-live-info"><strong>{live.title}</strong><small>{dateLabel(live.starts_at)} · {statusLabel(live.status)}</small></div>
          <span className={`fl-status-pill status-${live.status}`}>{statusLabel(live.status)}</span>
          <div className="fl-live-row-actions"><a href={`/admin/foco-live/${live.id}`}>Editar Live</a><a href={`/live/${live.slug}?host=1`}><Play size={15}/> Estúdio</a><a href={`/live/${live.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a><button className="danger" disabled={actionBusy === `delete-${live.id}`} onClick={() => deleteLive(live)}><Trash2 size={15}/></button></div>
        </article>)}
      </div>
    </section>

    {error && <div className="fl-dashboard-error">{error}</div>}
    {newLiveOpen && <div className="fl-new-live-overlay" onClick={(event) => event.target === event.currentTarget && setNewLiveOpen(false)}><section className="fl-new-live-modal">
      <button className="close" onClick={() => setNewLiveOpen(false)}>×</button><span>NOVA LIVE</span><h2>Como você quer começar?</h2>
      <label>Nome opcional<input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="Ex.: Quarta Vocal"/></label>
      <div className="fl-new-live-options">
        <button disabled={Boolean(busy)} onClick={() => quickCreate('later')}><Link2/><span><strong>Criar para depois</strong><small>Gera o link agora e você configura quando quiser.</small></span></button>
        <button disabled={Boolean(busy)} onClick={() => quickCreate('instant')}><Radio/><span><strong>Iniciar transmissão agora</strong><small>Cria a sala e abre o estúdio imediatamente.</small></span></button>
        <button disabled={Boolean(busy)} onClick={() => router.push('/admin/foco-live/nova?mode=schedule')}><CalendarDays/><span><strong>Agendar transmissão</strong><small>Defina tema, imagem, data, convite e agenda.</small></span></button>
      </div>
      {busy && <p className="fl-modal-progress">Criando sua live…</p>}{error && <p className="fl-modal-error">{error}</p>}
    </section></div>}
  </main>;
}
