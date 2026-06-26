import { AdminMediaUploader } from '@/components/admin-media-uploader';

export const dynamic = 'force-dynamic';

export default function AdminMediaPage() {
  return (
    <main className="page admin-shell">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Biblioteca de mídia</p>
          <h1>Mídia do Hub</h1>
          <p className="muted">Primeira camada da nova estrutura: upload direto para Cloudflare R2. Em seguida entra a conversão HLS.</p>
        </div>
        <a className="button secondary" href="/admin/biblioteca">Voltar para biblioteca</a>
      </section>

      <nav className="admin-tabs school-tabs">
        <a href="/admin">Resumo</a>
        <a href="/admin/cursos">Cursos</a>
        <a href="/admin/biblioteca">Biblioteca</a>
        <a className="active" href="/admin/midia">Mídia</a>
        <a href="/admin/produtos">Produtos</a>
        <a href="/admin/premium">Assinaturas</a>
        <a href="/admin/avaliacoes">Avaliações</a>
      </nav>

      <section className="admin-grid admin-section">
        <article className="admin-stat"><span>Origem</span><strong>R2</strong><p className="muted">Arquivos servidos pelo domínio público configurado.</p></article>
        <article className="admin-stat"><span>Próxima fase</span><strong>HLS</strong><p className="muted">Converter MP4 em streaming adaptativo para Safari/iOS.</p></article>
        <article className="admin-stat"><span>Migração</span><strong>Drive → R2</strong><p className="muted">Os cortes das aulas continuam preservados no banco.</p></article>
      </section>

      <AdminMediaUploader />
    </main>
  );
}
