export const dynamic = 'force-dynamic';

export default function AdminDriveShortcutPage() {
  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Google Drive Sync</p>
          <h1>Central do Drive</h1>
          <p className="muted">Conecte, navegue pelas suas pastas e importe a biblioteca completa do VIP.</p>
        </div>
        <a className="button secondary" href="/admin/conteudos">Voltar</a>
      </section>

      <nav className="admin-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/conteudos">Conteudos</a>
        <a href="/admin/drive">Drive Sync</a>
      </nav>

      <section className="admin-grid admin-section">
        <article className="admin-stat">
          <span>Passo 1</span>
          <strong>Conectar</strong>
          <p className="muted">Autorize o Hub a ler suas pastas e arquivos do Google Drive.</p>
          <a className="button" href="/admin/conteudos/google-drive">Conectar Google Drive</a>
        </article>

        <article className="admin-stat">
          <span>Passo 2</span>
          <strong>Selecionar pasta</strong>
          <p className="muted">Navegue pelo Drive dentro do Hub e escolha a pasta mae para sincronizar.</p>
          <a className="button" href="/admin/conteudos/selecionar-drive">Abrir seletor do Drive</a>
        </article>

        <article className="admin-stat">
          <span>Alternativo</span>
          <strong>Colar link</strong>
          <p className="muted">Use apenas quando quiser importar uma pasta especifica pelo link.</p>
          <a className="button secondary" href="/admin/conteudos/sincronizar-biblioteca">Colar link da pasta</a>
        </article>
      </section>
    </main>
  );
}
