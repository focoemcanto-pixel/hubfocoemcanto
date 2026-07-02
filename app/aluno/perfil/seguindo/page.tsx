import Link from 'next/link';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

export default function FollowingPage(){
  return <AppShell><main className="page"><h1>Seguindo</h1><p>Lista de perfis em breve.</p><Link href="/aluno/perfil">Voltar</Link></main></AppShell>;
}
