'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

type StreamSelectableVideo = {
  uid: string;
  name: string;
  title: string;
  duration?: number | null;
  matchTitle?: string;
  imported?: boolean;
};

type Props = {
  moduleId: string;
  productId?: string;
  videos: StreamSelectableVideo[];
};

function time(seconds?: number | null) {
  if (!seconds) return '—';
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function AdminStreamImportForm({ moduleId, productId = '', videos }: Props) {
  const selectableVideos = useMemo(() => videos.filter((video) => !video.imported), [videos]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const progress = submitting ? Math.min(96, 18 + selectedCount * 9) : 0;

  function toggleAll() {
    if (submitting) return;
    if (selectedCount === selectableVideos.length) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    selectableVideos.forEach((video) => { next[video.uid] = true; });
    setSelected(next);
  }

  function toggle(uid: string) {
    if (submitting) return;
    setSelected((current) => ({ ...current, [uid]: !current[uid] }));
  }

  return (
    <form action="/admin/stream/importar-video" method="post" onSubmit={(event) => {
      if (!selectedCount) {
        event.preventDefault();
        window.alert('Selecione pelo menos um vídeo para importar.');
        return;
      }
      setSubmitting(true);
    }}>
      <input type="hidden" name="module_id" value={moduleId} />
      <input type="hidden" name="product_id" value={productId} />

      <div className="media-migration-toolbar" style={{ marginBottom: 16, position: 'sticky', top: 0, zIndex: 5, padding: '12px 0', backdropFilter: 'blur(12px)' }}>
        <button className="admin-clean-button primary" type="submit" disabled={!selectedCount || submitting}>
          {submitting ? <><Loader2 size={16} className="premium-video-spinner" /> Importando {selectedCount} vídeo(s)...</> : `Importar selecionados (${selectedCount})`}
        </button>
        <button className="admin-clean-button secondary" type="button" disabled={submitting || !selectableVideos.length} onClick={toggleAll}>
          {selectedCount === selectableVideos.length && selectableVideos.length ? 'Desmarcar todos' : 'Selecionar todos livres'}
        </button>
        <span className="admin-clean-muted">{submitting ? 'Aguarde. O Hub está criando/vinculando as aulas no módulo.' : 'Selecione os vídeos na lista abaixo.'}</span>
      </div>

      {submitting ? (
        <div className="admin-help-box" style={{ marginBottom: 16 }}>
          <strong>Importação em andamento...</strong>
          <p className="muted">Não feche esta página. Ao finalizar, o Hub volta para esta tela com a confirmação.</p>
          <div className="progress media-migration-progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
      ) : null}

      <div className="admin-list">
        {videos.map((video) => (
          <label className="admin-row" key={video.uid} style={{ cursor: video.imported || submitting ? 'default' : 'pointer' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                name="uid"
                value={video.uid}
                checked={!video.imported && Boolean(selected[video.uid])}
                disabled={Boolean(video.imported) || submitting}
                onChange={() => toggle(video.uid)}
                style={{ marginTop: 8, width: 18, height: 18 }}
              />
              <input type="hidden" name={`name_${video.uid}`} value={video.name} />
              <div>
                <span className={`admin-clean-pill ${video.imported ? 'success' : selected[video.uid] ? 'success' : 'warning'}`}>
                  {video.imported ? 'Já importado' : selected[video.uid] ? 'Selecionado' : 'Livre'} · {time(video.duration)}
                </span>
                <h3>{video.title}</h3>
                <p className="muted">{video.matchTitle ? `Provável aula: ${video.matchTitle} · ` : ''}UID {video.uid}</p>
              </div>
            </div>
            {video.imported ? <span className="admin-clean-pill success">Atrelado</span> : selected[video.uid] ? <span className="admin-clean-pill success">Vai importar</span> : <span className="admin-clean-pill warning">Selecionável</span>}
          </label>
        ))}
        {!videos.length ? <p className="admin-clean-muted">Nenhum vídeo encontrado no Stream.</p> : null}
      </div>
    </form>
  );
}
