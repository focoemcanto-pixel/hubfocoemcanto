export const dynamic = 'force-dynamic';

export default async function StudentModulePage() {
  return (
    <main className="page">
      <section className="library-hero">
        <p className="eyebrow">Modulo</p>
        <h1>Carregando aulas</h1>
        <p className="muted">Abra a biblioteca e escolha a primeira aula do modulo.</p>
        <a className="button" href="/aluno/biblioteca">Voltar para biblioteca</a>
      </section>
    </main>
  );
}
