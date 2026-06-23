'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

type Props = {
  id: string;
};

export function DeleteReviewSubmissionButton({ id }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  async function handleDelete() {
    if (isDeleting) return;
    const ok = window.confirm('Excluir este envio? Essa ação não pode ser desfeita.');
    if (!ok) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/admin/avaliacoes/${id}/excluir`, {
        method: 'POST',
        headers: { 'x-hub-ajax': '1' },
        body: new FormData(),
      });
      if (!response.ok) throw new Error('delete_failed');
      setIsHidden(true);
    } catch {
      window.alert('Não consegui excluir este envio. Tente novamente.');
      setIsDeleting(false);
    }
  }

  if (isHidden) return null;

  return (
    <button className="delete review-delete-icon" title="Excluir envio" type="button" onClick={handleDelete} disabled={isDeleting}>
      <Trash2 size={16} />
    </button>
  );
}
