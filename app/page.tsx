const modules = [
  'Aprendendo a Segunda Voz',
  'Firmar Afinação',
  'Desenvolver Intuição',
  'Duetos para Treino',
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="card">
        <p>Grupo VIP Foco em Harmonia</p>
        <h1>Hub Foco em Canto</h1>
        <p>Treine divisão vocal, envie atividades e receba avaliação com estrelas e comentários.</p>
        <a className="button" href="/aluno">Entrar no app</a>
      </section>
      <section className="grid" style={{ marginTop: 16 }}>
        {modules.map((module) => (
          <article className="card" key={module}>
            <h2>{module}</h2>
            <p>Vídeos, áudios e exercícios organizados para prática.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
