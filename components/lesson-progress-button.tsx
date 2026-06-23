'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';

type LessonProgressButtonProps = {
  exerciseId: string;
  initialCompleted?: boolean;
};

export function LessonProgressButton({ exerciseId, initialCompleted = false }: LessonProgressButtonProps) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  function markComplete() {
    startTransition(async () => {
      setMessage('');
      const response = await fetch('/api/student/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, completed: true, positionSeconds: 0 }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || 'Não foi possível salvar agora.');
        return;
      }
      setCompleted(true);
      setMessage('Aula concluída!');
    });
  }

  return (
    <div className="lesson-progress-control">
      <button className={completed ? 'premium-outline-button is-completed' : 'premium-outline-button'} type="button" onClick={markComplete} disabled={isPending || completed}>
        {isPending ? <Loader2 size={18} className="admin-mini-spinner" /> : <Check size={18} />}
        {completed ? 'Aula concluída' : 'Marcar como concluída'}
      </button>
      {message ? <small className={completed ? 'lesson-progress-ok' : 'lesson-progress-error'}>{message}</small> : null}
    </div>
  );
}
