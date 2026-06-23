'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

type Props = { id: string };

export function DeleteReviewSubmissionButton({ id }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  async function handleDelete() {
    if (isDeleting) return;
    const ok = window.confirm('Excluir este envio? Essa ação não pode ser desfeita.');
    if (!ok) return;
    setIsDeleting(true);
    try {
      const form = new FormData();
      form.set('return_to', '/admin/avaliacoes');
      const response = await fetch(`/admin/avaliacoes/${id}/excluir`, { method: 'POST', headers: { 'x-hub-ajax': '1' }, body: form });
      if (!response.ok) throw new Error('delete_failed');
      setIsHidden(true);
    } catch {
      window.alert('Não consegui excluir este envio. Tente novamente.');
      setIsDeleting(false);
    }
  }

  if (isHidden) return null;

  return (
    <button
      className="review-delete-visible"
      title="Excluir envio"
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      style={{ position: 'relative', zIndex: 9, display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,91,91,.35)', borderRadius: 14, padding: '11px 14px', background: 'rgba(255,91,91,.12)', color: '#ff9a9a', fontWeight: 900, cursor: isDeleting ? 'wait' : 'pointer' }}
    >
      <Trash2 size={16} /> {isDeleting ? 'Excluindo...' : 'Excluir'}
    </button>
  );
}
