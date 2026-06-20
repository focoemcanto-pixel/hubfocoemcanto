const modules = [
  { title: 'Segunda Voz', text: 'Aprenda a sustentar outra linha vocal sem voltar para a melodia principal.' },
  { title: 'Firmar Afinação', text: 'Treinos objetivos para estabilidade, centro tonal e segurança vocal.' },
  { title: 'Intuição Vocal', text: 'Desenvolva percepção para encontrar caminhos de divisão vocal com naturalidade.' },
  { title: 'Duetos Guiados', text: 'Pratique com materiais preparados para cantar junto e enviar sua execução.' },
];

const steps = [
  'Assista aos vídeos e ouça os áudios de treino.',
  'Grave sua execução pelo celular ou envie um link.',
  'Receba avaliação com estrelas e comentário do professor.',
];

export default function HomePage() {
  return (
    <main className="marketing-page">
      <nav className="marketing-nav">
        <strong>Hub Foco em Canto</strong>
        <div>
          <a href="/login">Entrar</a>
          <a className="button" href="/cadastro">Criar acesso</a>
        </div>
      </nav>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Grupo VIP Foco em Harmonia</p>
          <h1 className="hero-title">Uma experiência premium para evoluir na divisão vocal.</h1>
          <p className="hero-subtitle">O conteúdo que antes ficava espalhado no Drive agora vira uma jornada guiada com trilhas, exercícios, envios, avaliações e comunidade.</p>
          <div className="hero-actions">
            <a className="button" href="/login">Acessar meu Hub</a>
            <a className="button secondary" href="#como-funciona">Ver como funciona</a>
          </div>
        </div>

        <div className="phone-preview" aria-label="Preview do app">
          <div className="phone-top" />
          <div className="phone-card highlight">
            <span>Continue sua jornada</span>
            <strong>Segunda Voz</strong>
            <div className="progress"><span style={{ width: '42%' }} /></div>
            <small>14 de 35 exercícios</small>
          </div>
          <div className="phone-card"><strong>Maranata</strong><small>Enviar atividade</small></div>
          <div className="phone-card"><strong>Dueto guiado</strong><small>Avaliação pendente</small></div>
          <div className="phone-nav"><span /> <span /> <span /> <span /> <span /></div>
        </div>
      </section>

      <section className="section-panel">
        <p className="eyebrow">Trilhas principais</p>
        <h2>Organização com cara de aplicativo, não de pasta.</h2>
        <div className="grid">
          {modules.map((module) => (
            <article className="card feature-card" key={module.title}>
              <h3>{module.title}</h3>
              <p className="muted">{module.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-panel" id="como-funciona">
        <p className="eyebrow">Como funciona</p>
        <h2>Do treino à avaliação em poucos passos.</h2>
        <div className="grid">
          {steps.map((step, index) => (
            <article className="card feature-card" key={step}>
              <p className="stat">0{index + 1}</p>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
