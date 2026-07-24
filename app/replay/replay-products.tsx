'use client';

import { useMemo, useRef } from 'react';
import type { ReplayProduct } from '@/lib/live-replays';

function money(cents?: number | null) {
  if (!cents) return 'Conheça agora';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function keyOf(product: ReplayProduct) {
  return `${product.name} ${product.slug}`.toLowerCase();
}

function groupProducts(products: ReplayProduct[]) {
  const clean = products.filter((product) => !/(ebook|e-book|guia|melisma)/i.test(keyOf(product)));
  const mentoring = clean.filter((product) => /mentoria/i.test(keyOf(product)));
  const division = clean.filter((product) => /(harmonia|grupo vip|escola foco em canto|escola-foco-em-canto)/i.test(keyOf(product)) && !/mentoria/i.test(keyOf(product)));
  const harmomus = clean.filter((product) => /harmomus/i.test(keyOf(product)));
  return { division, mentoring, harmomus };
}

function ProductCard({ product }: { product: ReplayProduct }) {
  return (
    <article className="replay-product-slide">
      <div className="replay-product-cover">
        {product.cover_url ? <img src={product.cover_url} alt={product.name} /> : <span>FOCO</span>}
      </div>
      <div className="replay-product-body">
        <small>{product.billing_type === 'recurring' ? 'ASSINATURA' : 'CURSO'}</small>
        <h3>{product.name}</h3>
        {product.description && <p>{product.description}</p>}
        <div className="replay-product-footer">
          <b>{money(product.price_cents)}</b>
          <a href={product.redirect_url || '#'} target="_blank" rel="noreferrer">Ver detalhes</a>
        </div>
      </div>
    </article>
  );
}

function ProductRail({ title, description, products }: { title: string; description: string; products: ReplayProduct[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!products.length) return null;
  const move = (direction: number) => ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.92, behavior: 'smooth' });

  return (
    <section className="replay-objective-block">
      <div className="replay-objective-head">
        <div><span>OBJETIVO</span><h3>{title}</h3><p>{description}</p></div>
        {products.length > 1 && <div className="replay-carousel-controls"><button onClick={() => move(-1)} aria-label="Curso anterior">‹</button><button onClick={() => move(1)} aria-label="Próximo curso">›</button></div>}
      </div>
      <div className="replay-product-rail" ref={ref}>{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      {products.length > 1 && <div className="replay-carousel-hint">Arraste ou use as setas para conhecer os próximos cursos</div>}
    </section>
  );
}

function MentorshipFeature({ products }: { products: ReplayProduct[] }) {
  const product = products[0];
  if (!product) return null;

  return (
    <section className="replay-mentorship-feature" id="mentoria">
      <div className="replay-mentorship-copy">
        <span>ACOMPANHAMENTO COMPLETO</span>
        <h2>Transforme sua voz com direção, feedback e acompanhamento de verdade.</h2>
        <p>Quer evoluir em técnica vocal, respiração, afinação, extensão, agudos, divisão vocal e percepção musical sem caminhar sozinho? Na Mentoria Foco em Canto, você recebe instrução prática, correções e um direcionamento pensado para a sua voz e para a realidade do seu ministério.</p>
        <div className="replay-mentorship-benefits">
          <span>Feedbacks e correções individuais</span>
          <span>Aulas ao vivo e direcionamento contínuo</span>
          <span>Grupo exclusivo de acompanhamento</span>
          <span>Aplicação prática ao ministério de louvor</span>
        </div>
        <a href={product.redirect_url || '#'} target="_blank" rel="noreferrer">Conhecer a Mentoria Foco em Canto</a>
      </div>
      <div className="replay-mentorship-visual">
        {product.cover_url ? <img src={product.cover_url} alt={product.name} /> : <div className="replay-mentorship-placeholder">FOCO EM CANTO</div>}
        <div><small>MENTORIA PREMIUM</small><strong>{product.name}</strong></div>
      </div>
    </section>
  );
}

export default function ReplayProducts({ products }: { products: ReplayProduct[] }) {
  const groups = useMemo(() => groupProducts(products), [products]);
  const hasProducts = groups.division.length + groups.mentoring.length + groups.harmomus.length > 0;

  return (
    <section className="replay-products" id="cursos">
      <MentorshipFeature products={groups.mentoring} />

      <div className="replay-section-title replay-courses-heading"><span>CURSOS E FERRAMENTAS</span><h2>Escolha o próximo passo para o seu objetivo.</h2><p>Depois do replay, aprofunde a habilidade que mais precisa desenvolver agora.</p></div>

      {!hasProducts ? <div className="replay-products-empty"><span>FOCO EM CANTO</span><h3>Os cursos serão exibidos aqui.</h3><p>Cadastre os produtos no painel da escola para apresentá-los nesta página.</p></div> : <div className="replay-objectives">
        <ProductRail title="Divisão vocal" description="Desenvolva independência auditiva, afinação e segurança para criar e sustentar segunda e terceira voz com Foco em Harmonia, Grupo VIP e Escola Foco em Canto." products={groups.division} />
        <ProductRail title="Harmomus" description="Acesse kits vocais organizados para estudar cada voz, preparar repertórios e acelerar os ensaios da sua equipe ou ministério." products={groups.harmomus} />
      </div>}
    </section>
  );
}
