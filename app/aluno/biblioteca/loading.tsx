export default function LibraryLoading() {
  return (
    <main className="page route-surface">
      <section className="library-hero skeleton-card" aria-label="Carregando biblioteca" />
      <section className="library-grid">
        {Array.from({ length: 6 }).map((_, index) => <article className="library-card skeleton-card" key={index} />)}
      </section>
    </main>
  );
}
