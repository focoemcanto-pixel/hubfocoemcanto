import { AdminSettingsForm } from '@/components/admin/admin-settings-form';
import { brandingPipelineCss } from '@/components/admin/branding-pipeline-manager';
import { getAdminSettings } from '@/lib/data/admin-settings';

export const dynamic = 'force-dynamic';

const css = `
${brandingPipelineCss}
.branding-admin-page{max-width:1380px;margin:0 auto;color:#f8f7fb;padding:10px 0 48px}.branding-admin-header{display:flex;align-items:center;justify-content:space-between;gap:22px;margin-bottom:24px}.branding-admin-title{display:flex;align-items:center;gap:16px}.branding-admin-icon{width:48px;height:48px;border-radius:18px;display:grid;place-items:center;color:#f6c75c;font-size:26px;background:radial-gradient(circle,rgba(246,199,92,.22),rgba(246,199,92,.06));box-shadow:0 0 34px rgba(246,199,92,.18)}.branding-admin-header h1{margin:0;font-size:32px;letter-spacing:-.04em}.branding-admin-header p{margin:4px 0 0;color:rgba(248,247,251,.66)}.branding-admin-actions{display:flex;gap:12px;flex-wrap:wrap}.branding-admin-actions a{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:12px 18px;color:#fff;text-decoration:none;font-weight:900;background:rgba(255,255,255,.035);transition:.18s ease}.branding-admin-actions a:hover{transform:translateY(-2px);border-color:rgba(246,199,92,.42)}.branding-admin-actions .gold{background:linear-gradient(135deg,#ffd978,#c99a35);border:0;color:#171007}.branding-admin-card{border:1px solid rgba(246,199,92,.26);border-radius:22px;background:radial-gradient(circle at 80% 10%,rgba(246,199,92,.11),transparent 42%),linear-gradient(145deg,rgba(255,255,255,.052),rgba(255,255,255,.018));box-shadow:0 25px 75px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.05);padding:20px}.branding-admin-kicker{display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.28em;color:#f6c75c;font-size:12px;font-weight:900}.branding-admin-card h2{margin:0;font-size:24px}.branding-admin-card>p{margin:6px 0 18px;color:rgba(248,247,251,.62)}@media(max-width:760px){.branding-admin-header{display:grid}.branding-admin-actions{display:grid}.branding-admin-actions a{width:100%}.branding-admin-header h1{font-size:28px}}
`;

export default async function BrandingSettingsPage() {
  const settings = await getAdminSettings();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <main className="branding-admin-page">
        <section className="branding-admin-header">
          <div className="branding-admin-title"><span className="branding-admin-icon">✦</span><div><h1>Branding</h1><p>Identidade visual oficial do Hub Foco em Canto.</p></div></div>
          <div className="branding-admin-actions"><a href="/admin/configuracoes">Voltar</a><a className="gold" href="/admin/configuracoes/branding">Atualizar</a></div>
        </section>
        <section className="branding-admin-card">
          <span className="branding-admin-kicker">Pipeline inteligente de identidade</span>
          <h2>Branding da plataforma</h2>
          <p>Suba uma imagem matriz para gerar logo principal, favicon, imagem de login, hero/banner e Open Graph.</p>
          <AdminSettingsForm settings={settings} />
        </section>
      </main>
    </>
  );
}
