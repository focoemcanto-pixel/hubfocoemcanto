const exercises = [
  { title: 'Maranata', category: 'Segunda voz', status: 'Disponível' },
  { title: 'Tu És Fiel Senhor', category: 'Dueto', status: 'Disponível' },
  { title: 'Exercício de afinação 01', category: 'Afinação', status: 'Disponível' },
];

export default function StudentPage() {
  return (
    <main className="page">
      <h1>Minha área de treino</h1>
      <p>Acesse os exercícios do VIP e envie suas atividades para avaliação.</p>
      <section className="grid">
        {exercises.map((exercise) => (
          <article className="card" key={exercise.title}>
            <p>{exercise.category}</p>
            <h2>{exercise.title}</h2>
            <p>{exercise.status}</p>
            <a className="button" href="/aluno/enviar">Enviar atividade</a>
          </article>
        ))}
      </section>
    </main>
  );
}
