'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

type Props = {
  moduleId: string;
  lessonId: string;
  initialTitle: string;
};

export function AdminInlineLessonName({ moduleId, lessonId, initialTitle }: Props) {
  const [value, setValue] = useState(initialTitle);
  const [saved, setSaved] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
    }
  }, [editing]);

  function commit() {
    const title = value.trim();
    if (!title) {
      setValue(saved);
      setEditing(false);
      return;
    }
    if (title === saved.trim()) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const response = await fetch('/admin/api/aulas/renomear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ module_id: moduleId, lesson_id: lessonId, title }),
      });
      if (response.ok) {
        setSaved(title);
        setValue(title);
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return <button type="button" className="admin-inline-lesson-title" onClick={() => setEditing(true)}>{pending ? 'Salvando...' : saved}</button>;
  }

  return <input ref={inputRef} className="admin-inline-lesson-input" value={value} onChange={(event) => setValue(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } if (event.key === 'Escape') { setValue(saved); setEditing(false); } }} />;
}
