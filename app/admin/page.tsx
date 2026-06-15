const pending = [
  { student: 'Aluno exemplo', exercise: 'Maranata', status: 'Aguardando avaliação' },
];

export default function AdminPage() {
  return (
    <main className="page">
      <h1>Painel do professor</h1>
      <p>Gerencie alunos, conteúdos, envios e avaliações.</p>
      <section className="grid">
        <article className="card"><h2>Alunos ativos</h2><p>0</p></article>
        <article className="card"><h2>Envios pendentes</h2><p>{pending.length}</p></article>
        <article className="card"><h2>Assinaturas vencidas</h2><p>0</p></article>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Fila de avaliação</h2>
        {pending.map((item) => (
          <p key={item.student}>{item.student} - {item.exercise} - {item.status}</p>
        ))}
      </section>
    </main>
  );
}
