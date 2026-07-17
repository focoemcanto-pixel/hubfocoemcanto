export default function FocoLiveSettingsPage() {
  return <main className="foco-live-admin">
    <section className="foco-live-hero"><div><span className="foco-live-kicker">Configurações</span><h1>Padrões do Foco Live</h1><p>Defina comportamentos que serão usados como padrão em novas transmissões. Conteúdos reutilizáveis permanecem separados na Biblioteca.</p></div><a className="foco-live-secondary" href="/admin/foco-live">← Voltar</a></section>
    <section className="foco-live-grid">
      <article className="foco-live-panel"><div className="foco-live-panel-head"><div><span className="foco-live-kicker">Experiência</span><h2>Padrões da sala</h2></div></div><div className="foco-live-toggles"><label><input type="checkbox" defaultChecked/><span><strong>Chat habilitado</strong><small>Ativar em novas lives.</small></span></label><label><input type="checkbox" defaultChecked/><span><strong>Levantar mão</strong><small>Permitir pedidos de fala.</small></span></label><label><input type="checkbox" defaultChecked/><span><strong>Convidados liberados</strong><small>Entrada por link público.</small></span></label></div></article>
      <article className="foco-live-panel"><div className="foco-live-panel-head"><div><span className="foco-live-kicker">Biblioteca</span><h2>Conteúdo reutilizável</h2><p>Ofertas ficam disponíveis automaticamente em todas as lives.</p></div></div><div className="foco-live-scene-list"><a href="/admin/foco-live/ofertas"><b>01</b><span><strong>Ofertas</strong><small>Produtos, links, preços e CTAs</small></span></a><button disabled><b>02</b><span><strong>Apresentações</strong><small>Em breve</small></span></button><button disabled><b>03</b><span><strong>Cards e avisos</strong><small>Em breve</small></span></button></div></article>
    </section>
  </main>;
}
