'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, BookOpen, Home, UserRound, UsersRound } from 'lucide-react';

const navItems = [
  { href: '/aluno', label: 'Início', icon: Home },
  { href: '/aluno/biblioteca', label: 'Biblioteca', icon: BookOpen },
  { href: '/aluno/comunidade', label: 'Comunidade', icon: UsersRound },
  { href: '/aluno/notificacoes', label: 'Avisos', icon: Bell },
  { href: '/aluno/perfil', label: 'Perfil', icon: UserRound },
];

function isActive(pathname: string, href: string) {
  if (href === '/aluno') return pathname === '/aluno';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudentBottomNav() {
  const pathname = usePathname() || '/aluno';

  return (
    <nav className="bottom-nav app-bottom-nav student-bottom-nav" aria-label="Navegação do aluno">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);

        return (
          <Link
            href={item.href}
            key={item.href}
            prefetch
            aria-current={active ? 'page' : undefined}
            className={active ? 'is-active' : undefined}
          >
            <Icon aria-hidden size={21} strokeWidth={active ? 2.8 : 2.15} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
