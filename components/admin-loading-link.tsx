'use client';

import { useState } from 'react';

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
  loadingLabel?: string;
};

export function AdminLoadingLink({ href, children, className = '', loadingLabel = 'Carregando...' }: Props) {
  const [loading, setLoading] = useState(false);

  return (
    <a
      className={`${className} ${loading ? 'admin-link-loading' : ''}`.trim()}
      href={href}
      onClick={() => setLoading(true)}
      aria-busy={loading}
    >
      {loading ? <span className="admin-mini-spinner" /> : null}
      <span>{loading ? loadingLabel : children}</span>
    </a>
  );
}
