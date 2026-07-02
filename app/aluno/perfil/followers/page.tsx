import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
export const dynamic = 'force-dynamic';
export default function Page(){return <AppShell><main className="page"><h1>Followers</h1><Link href="/aluno/perfil">Voltar</Link></main></AppShell>}
