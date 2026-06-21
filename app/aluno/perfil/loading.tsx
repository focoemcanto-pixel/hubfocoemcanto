export default function ProfileLoading() {
  return (
    <main className="page route-surface">
      <section className="card skeleton-card" aria-label="Carregando perfil" />
      <section className="grid" style={{ marginTop: 18 }}>
        {Array.from({ length: 3 }).map((_, index) => <article className="card skeleton-card" key={index} />)}
      </section>
    </main>
  );
}
