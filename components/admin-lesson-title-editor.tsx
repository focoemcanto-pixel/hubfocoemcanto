'use client';

import { Check, Loader2, X } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';

type Props = {
  moduleId: string;
  lessonId: string;
  initialTitle: string;
};

export function AdminLessonTitleEditor({ moduleId, lessonId, initialTitle }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [savedTitle, setSavedTitle] = useState(initialTitle);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const changed = title.trim() && title.trim() !== savedTitle.trim();

  function save() {
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle === savedTitle.trim()) return;

    startTransition(async () => {
      setStatus('idle');
      const response = await fetch(`/admin/biblioteca/${moduleId}/aulas/renomear`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lesson_id: lessonId, title: cleanTitle }),
      });

      if (!response.ok) {
        setStatus('error');
        return;
      }

      setSavedTitle(cleanTitle);
      setTitle(cleanTitle);
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1600);
    });
  }

  function cancel() {
    setTitle(savedTitle);
    setStatus('idle');
    inputRef.current?.blur();
  }

  return (
    <div className="premium-inline-title-editor">
      <input
        ref={inputRef}
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setStatus('idle');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            save();
          }
          if (event.key === 'Escape') cancel();
        }}
        aria-label="Título da aula"
      />
      <div className="premium-inline-title-actions">
        {changed ? (
          <>
            <button type="button" className="premium-icon-save" onClick={save} disabled={isPending} aria-label="Salvar título">
              {isPending ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
            </button>
            <button type="button" className="premium-icon-cancel" onClick={cancel} disabled={isPending} aria-label="Cancelar edição">
              <X size={16} />
            </button>
          </>
        ) : (
          <span className={status === 'saved' ? 'saved' : status === 'error' ? 'error' : ''}>{status === 'saved' ? 'Salvo' : status === 'error' ? 'Erro' : ''}</span>
        )}
      </div>
    </div>
  );
}
