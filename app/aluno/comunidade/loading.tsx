export default function CommunityLoading() {
  return (
    <main className="page route-surface">
      <section className="section-heading"><div className="skeleton-card" style={{ minHeight: 56, width: 280 }} /></section>
      <section className="feed-list">
        {Array.from({ length: 4 }).map((_, index) => <article className="feed-card skeleton-card" key={index} />)}
      </section>
    </main>
  );
}
