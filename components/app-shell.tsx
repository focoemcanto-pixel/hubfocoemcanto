import Link from 'next/link';
import { StudentRoutePrefetcher } from '@/components/student-route-prefetcher';
import { FeedInitialVideoBoost } from '@/components/feed-initial-video-boost';

const navItems = [
  { href: '/aluno', label: 'Feed' },
  { href: '/aluno/biblioteca', label: 'Biblioteca' },
  { href: '/aluno/central', label: 'Central' },
  { href: '/aluno/comunidade', label: 'Comun.' },
  { href: '/aluno/perfil', label: 'Perfil' },
];

const navCss = `.app-bottom-nav{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;align-items:center!important;gap:0!important;min-height:72px!important;padding:10px max(10px,env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-right))!important}.app-bottom-nav a{display:flex!important;align-items:center!important;justify-content:center!important;min-width:0!important;white-space:nowrap!important;font-size:clamp(11px,3vw,14px)!important;font-weight:900!important;text-align:center!important}`;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <style dangerouslySetInnerHTML={{ __html: navCss }} />
      <StudentRoutePrefetcher />
      <FeedInitialVideoBoost />
      <main className="app-content route-surface">{children}</main>
      <nav className="bottom-nav app-bottom-nav" aria-label="Navegação do aluno">
        {navItems.map((item) => (
          <Link href={item.href} key={item.href} prefetch>{item.label}</Link>
        ))}
      </nav>
    </div>
  );
}
