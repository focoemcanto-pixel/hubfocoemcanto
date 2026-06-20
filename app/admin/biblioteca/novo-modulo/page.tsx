export const dynamic = 'force-dynamic';

export default function NewModulePage() {
  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Novo modulo</p>
          <h1>Criar area de estudo</h1>
          <p className="muted">Crie uma categoria principal da Biblioteca VIP.</p>
        </div>
        <a className="button secondary" href="/admin/biblioteca">Voltar</a>
      </section>

      <section className="content-card admin-section">
        <form className="admin-form" action="/admin/biblioteca/modulos/criar" method="post">
          <label>Titulo<input name="title" required placeholder="Ex: Segunda Voz" /></label>
          <label>Descricao<textarea name="description" placeholder="Explique o objetivo desse modulo" /></label>
          <label>Ordem<input name="sort_order" type="number" defaultValue="1" /></label>
          <button className="button" type="submit">Criar modulo</button>
        </form>
      </section>
    </main>
  );
}
