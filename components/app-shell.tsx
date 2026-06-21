import Link from 'next/link';

const navItems = [
  { href: '/aluno', label: 'Início' },
  { href: '/aluno/biblioteca', label: 'Biblioteca' },
  { href: '/aluno/comunidade', label: 'Comunidade' },
  { href: '/aluno/perfil', label: 'Perfil' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <main className="app-content">{children}</main>
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <Link href={item.href} key={item.href}>{item.label}</Link>
        ))}
      </nav>
    </div>
  );
}
