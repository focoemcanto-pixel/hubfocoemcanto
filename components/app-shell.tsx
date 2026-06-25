import Link from 'next/link';
import { StudentRoutePrefetcher } from '@/components/student-route-prefetcher';
import { FeedInitialVideoBoost } from '@/components/feed-initial-video-boost';
import { FeedPosterHydrator } from '@/components/feed-poster-hydrator';

const navItems = [
  { href: '/aluno', label: 'Feed' },
  { href: '/aluno/biblioteca', label: 'Biblioteca' },
  { href: '/aluno/central', label: 'Central' },
  { href: '/aluno/comunidade', label: 'Comun.' },
  { href: '/aluno/perfil', label: 'Perfil' },
];

export function AppShell({ children, hideNav = false }: { children: React.ReactNode; hideNav?: boolean }) {
  return (
    <div className={`app-shell ${hideNav ? 'hide-bottom-nav' : ''}`}>
      <StudentRoutePrefetcher />
      <FeedInitialVideoBoost />
      <FeedPosterHydrator />
      <main className="app-content route-surface">{children}</main>
      {!hideNav ? (
        <nav className="bottom-nav app-bottom-nav" aria-label="Navegação do aluno">
          {navItems.map((item) => (
            <Link href={item.href} key={item.href} prefetch>{item.label}</Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
