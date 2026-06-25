import Link from 'next/link';
import { StudentRoutePrefetcher } from '@/components/student-route-prefetcher';
import { FeedVideoWarmup } from '@/components/feed-video-warmup';

const navItems = [
  { href: '/aluno', label: 'Feed' },
  { href: '/aluno/biblioteca', label: 'Biblioteca' },
  { href: '/aluno/comunidade', label: 'Comunidade' },
  { href: '/aluno/perfil', label: 'Perfil' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <StudentRoutePrefetcher />
      <FeedVideoWarmup />
      <main className="app-content route-surface">{children}</main>
      <nav className="bottom-nav app-bottom-nav" aria-label="Navegação do aluno">
        {navItems.map((item) => (
          <Link href={item.href} key={item.href} prefetch>{item.label}</Link>
        ))}
      </nav>
    </div>
  );
}
