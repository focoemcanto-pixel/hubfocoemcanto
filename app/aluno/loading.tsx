export default function StudentLoading() {
  return (
    <main className="page app-home premium-student-home route-surface">
      <section className="premium-hero skeleton-card" aria-label="Carregando painel" />
      <section className="premium-continue-panel" style={{ marginTop: 22 }}>
        <div className="premium-section-heading"><div className="skeleton-card" style={{ minHeight: 28, width: 220 }} /></div>
        <div className="premium-course-row">
          {Array.from({ length: 4 }).map((_, index) => <div className="premium-course-card skeleton-card" key={index} />)}
        </div>
      </section>
      <section className="feed-layout premium-community-feed">
        {Array.from({ length: 3 }).map((_, index) => <article className="feed-card skeleton-card" key={index} />)}
      </section>
    </main>
  );
}
