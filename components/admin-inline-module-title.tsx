'use client';

import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

type Props = {
  moduleId: string;
  initialTitle: string;
};

export function AdminInlineModuleTitle({ moduleId, initialTitle }: Props) {
  const [value, setValue] = useState(initialTitle);
  const [saved, setSaved] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
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
      const response = await fetch('/admin/api/modulos/renomear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ module_id: moduleId, title }),
      });
      if (response.ok) {
        setSaved(title);
        setValue(title);
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return (
      <button type="button" className="admin-inline-module-title" onClick={() => setEditing(true)}>
        <span>{pending ? 'Salvando...' : saved}</span>
        <Pencil size={18} />
      </button>
    );
  }

  return <input ref={inputRef} className="admin-inline-module-input" value={value} onChange={(event) => setValue(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); } if (event.key === 'Escape') { setValue(saved); setEditing(false); } }} />;
}
