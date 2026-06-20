export const dynamic = 'force-dynamic';

export default function AdminDriveShortcutPage() {
  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Google Drive Sync</p>
          <h1>Central do Drive</h1>
          <p className="muted">Use esta area para conectar o Google Drive e importar sua biblioteca completa.</p>
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
          <strong>Sincronizar</strong>
          <p className="muted">Cole a pasta mae. Cada subpasta vira modulo e cada arquivo vira exercicio.</p>
          <a className="button" href="/admin/conteudos/sincronizar-biblioteca">Sincronizar biblioteca</a>
        </article>
      </section>
    </main>
  );
}
