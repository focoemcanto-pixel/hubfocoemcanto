import { createAdminClient } from '@/lib/supabase/admin';
import OffersClient from './offers-client';

export const dynamic = 'force-dynamic';

export default async function FocoLiveOffersPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('live_offers')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <main className="foco-live-admin">
      <section className="foco-live-hero">
        <div>
          <span className="foco-live-kicker">Biblioteca de ofertas</span>
          <h1>Prepare seus pitches antes de entrar ao vivo.</h1>
          <p>Cadastre produtos, links e CTAs uma única vez e exiba em tela dividida, faixa sobre o vídeo ou botão flutuante.</p>
        </div>
        <a className="foco-live-secondary" href="/admin/foco-live">← Voltar para o Foco Live</a>
      </section>
      <OffersClient initialOffers={(data || []) as any[]} />
    </main>
  );
}
