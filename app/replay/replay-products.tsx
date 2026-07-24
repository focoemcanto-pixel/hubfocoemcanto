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
  const clean = products.filter((product) => !/(ebook|e-book|guia)/i.test(keyOf(product)));
  const division = clean.filter((product) => /(harmonia|grupo vip|escola foco em canto|escola-foco-em-canto)/i.test(keyOf(product)) && !/mentoria/i.test(keyOf(product)));
  const mentoring = clean.filter((product) => /mentoria/i.test(keyOf(product)));
  const harmomus = clean.filter((product) => /harmomus/i.test(keyOf(product)));
  const used = new Set([...division, ...mentoring, ...harmomus].map((item) => item.id));
  const others = clean.filter((product) => !used.has(product.id));
  return { division, mentoring, harmomus, others };
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
  const move = (direction: number) => ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.9, behavior: 'smooth' });

  return (
    <section className="replay-objective-block">
      <div className="replay-objective-head">
        <div><span>OBJETIVO</span><h3>{title}</h3><p>{description}</p></div>
        {products.length > 1 && <div className="replay-carousel-controls"><button onClick={() => move(-1)} aria-label="Curso anterior">‹</button><button onClick={() => move(1)} aria-label="Próximo curso">›</button></div>}
      </div>
      <div className="replay-product-rail" ref={ref}>{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      {products.length > 1 && <div className="replay-carousel-hint">Arraste ou use as setas para ver os próximos cursos</div>}
    </section>
  );
}

export default function ReplayProducts({ products }: { products: ReplayProduct[] }) {
  const groups = useMemo(() => groupProducts(products), [products]);
  const hasProducts = groups.division.length + groups.mentoring.length + groups.harmomus.length + groups.others.length > 0;

  return (
    <section className="replay-products" id="cursos">
      <div className="replay-section-title"><span>CONTINUE EVOLUINDO</span><h2>Cursos para o próximo passo da sua voz</h2><p>Escolha seu objetivo e conheça o caminho mais indicado para avançar.</p></div>
      {!hasProducts ? <div className="replay-products-empty"><span>FOCO EM CANTO</span><h3>Os cursos serão exibidos aqui.</h3><p>Cadastre ou publique os produtos no painel da escola.</p></div> : <div className="replay-objectives">
        <ProductRail title="Divisão vocal" description="Desenvolva independência auditiva, afinação e segurança para criar e sustentar segunda e terceira voz com Foco em Harmonia, Grupo VIP e Escola Foco em Canto." products={groups.division} />
        <ProductRail title="Mentoria completa para cantar e dominar técnicas" description="Acompanhamento no desenvolvimento da voz, grupo exclusivo, sala de correções, aulas ao vivo e orientação direta para evoluir com consistência." products={groups.mentoring} />
        <ProductRail title="Harmomus" description="Tenha acesso a kits vocais organizados para estudar vozes, ensaiar repertórios e acelerar a preparação musical da sua equipe." products={groups.harmomus} />
        <ProductRail title="Outros cursos" description="Outras soluções da escola para ampliar sua técnica, percepção e prática vocal." products={groups.others} />
      </div>}
    </section>
  );
}
