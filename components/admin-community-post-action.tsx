'use client';

import { useState } from 'react';

export function AdminCommunityPostAction({ postId }: { postId: string }) {
  const [busy, setBusy] = useState(false);
  async function handleClick() {
    if (busy) return;
    if (!window.confirm('Excluir esta publicação da comunidade?')) return;
    setBusy(true);
    const response = await fetch(`/api/community/posts/${postId}`, { method: 'DELETE', headers: { accept: 'application/json' } });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.detail || data?.error || 'Não foi possível excluir.');
      setBusy(false);
      return;
    }
    window.location.reload();
  }
  return <button className="admin-clean-button danger" type="button" onClick={handleClick} disabled={busy}>{busy ? 'Excluindo...' : 'Excluir'}</button>;
}
