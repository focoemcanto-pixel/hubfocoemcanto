import { Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { DynamicBrandLogo, dynamicBrandLogoCss } from '@/components/dynamic-brand-logo';
import { focoAcademyLogoCss } from '@/components/foco-academy-logo';
import { getAdminSettings } from '@/lib/data/admin-settings';

type Search = { email?: string; token?: string; sent?: string; erro?: string; ok?: string };

function message(code?: string) {
  if (!code) return '';
  const map: Record<string, string> = {
    email: 'Informe um e-mail válido.',
    schema: 'Falta ativar a migração de recuperação no Supabase.',
    envio: 'Não consegui enviar o e-mail agora. Verifique a variável RESEND_API_KEY.',
    expirado: 'Este link expirou. Solicite um novo link.',
    invalido: 'Link inválido. Solicite um novo link.',
    senha_curta: 'A nova senha precisa ter pelo menos 6 caracteres.',
    senha_diferente: 'As senhas não conferem.',
  };
  return map[code] || 'Não foi possível continuar. Tente novamente.';
}

export default async function PasswordRecoveryPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const params = searchParams ? await searchParams : {};
  const settings = await getAdminSettings();
  const email = String(params.email || '');
  const token = String(params.token || '');
  const error = message(params.erro);
  const sent = params.sent === '1';
  const ok = params.ok === '1';

  return (
    <main className="academy-login-page hub-login-page">
      <style dangerouslySetInnerHTML={{ __html: `${focoAcademyLogoCss}${dynamicBrandLogoCss}` }} />
      <section className="academy-login-shell hub-login-shell">
        <aside className="academy-login-brand hub-login-brand">
          <div className="academy-brand-lockup"><DynamicBrandLogo settings={settings} /></div>
          <h1>Recupere <span>seu acesso.</span></h1>
          <p>Use seu e-mail cadastrado para criar uma nova senha e voltar para seus treinos.</p>
          <div className="academy-benefits">
            <article><ShieldCheck size={24} /><div><strong>Link seguro</strong><span>O link expira automaticamente.</span></div></article>
            <article><Lock size={24} /><div><strong>Nova senha</strong><span>Depois de redefinir, use apenas a senha nova.</span></div></article>
          </div>
        </aside>
        <section className="academy-login-panel">
          <div className="academy-login-panel-inner">
            <p className="academy-eyebrow"><Sparkles size={16} /> Recuperação de senha</p>
            <h2>{ok ? 'Senha atualizada' : token ? 'Crie uma nova senha' : 'Esqueceu sua senha?'}</h2>
            <p className="academy-muted">{ok ? 'Agora você já pode entrar novamente.' : token ? 'Digite sua nova senha abaixo.' : 'Informe seu e-mail e enviaremos um link para redefinir seu acesso.'}</p>
            {error ? <div className="academy-login-error">{error}</div> : null}
            {sent ? <div className="academy-login-error" style={{ borderColor: 'rgba(53,205,93,.35)', color: '#91f7a6' }}>Se o e-mail estiver cadastrado, o link de recuperação foi enviado.</div> : null}
            {ok ? <a className="academy-primary-button" href={`/${email ? `?email=${encodeURIComponent(email)}&password=1` : ''}`}>Voltar para o login <span>→</span></a> : token ? (
              <form className="academy-login-form" action="/auth/password-reset/confirm" method="post">
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="token" value={token} />
                <label><span>Nova senha</span><div><Lock size={20} /><input name="password" type="password" required minLength={6} placeholder="mínimo 6 caracteres" /></div></label>
                <label><span>Confirmar senha</span><div><Lock size={20} /><input name="confirm_password" type="password" required minLength={6} placeholder="repita a senha" /></div></label>
                <button className="academy-primary-button" type="submit">Atualizar senha <span>→</span></button>
              </form>
            ) : (
              <form className="academy-login-form" action="/auth/password-reset" method="post">
                <label><span>E-mail</span><div><Mail size={20} /><input name="email" type="email" required defaultValue={email} placeholder="seu@email.com" /></div></label>
                <button className="academy-primary-button" type="submit">Enviar link <span>→</span></button>
              </form>
            )}
            <p className="academy-security"><a href={`/${email ? `?email=${encodeURIComponent(email)}&password=1` : ''}`}>Voltar para o login</a></p>
          </div>
        </section>
      </section>
    </main>
  );
}
