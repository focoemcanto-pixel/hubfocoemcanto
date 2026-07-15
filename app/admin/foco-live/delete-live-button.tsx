'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteLiveButton({ id, title, status }: { id: string; title: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function remove(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (status === 'live') {
      setError('Encerre a transmissão antes de apagar.');
      return;
    }
    if (!window.confirm(`Apagar definitivamente a live “${title}”?`)) return;

    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/foco-live/${id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível apagar.');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível apagar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span style={{ display: 'grid', justifyItems: 'end', gap: 5 }}>
      <button
        type="button"
        onClick={remove}
        disabled={loading || status === 'live'}
        title={status === 'live' ? 'Encerre a transmissão antes de apagar' : 'Apagar live'}
        style={{
          border: '1px solid rgba(255,100,120,.25)',
          borderRadius: 10,
          background: 'rgba(255,70,95,.08)',
          color: status === 'live' ? '#776d78' : '#ff8fa1',
          padding: '8px 11px',
          fontWeight: 800,
          cursor: status === 'live' ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Apagando…' : 'Apagar'}
      </button>
      {error && <small style={{ color: '#ff8fa1', maxWidth: 180, textAlign: 'right' }}>{error}</small>}
    </span>
  );
}
