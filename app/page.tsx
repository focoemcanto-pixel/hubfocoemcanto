import { GraduationCap, Lock, Mail, PlayCircle, ShieldCheck, Sparkles, Star, Users, Smartphone } from 'lucide-react';
import { DynamicBrandLogo, dynamicBrandLogoCss } from '@/components/dynamic-brand-logo';
import { focoAcademyLogoCss } from '@/components/foco-academy-logo';
import { getAdminSettings } from '@/lib/data/admin-settings';

type LoginSearch = { email?: string; setup?: string; password?: string; erro?: string };

function message(code?: string) {
  if (!code) return '';
  const map: Record<string, string> = {
    email: 'Informe um e-mail válido.',
    perfil: 'Não consegui preparar seu perfil agora. Tente novamente.',
    celular: 'Informe seu número de celular para continuar.',
    senha_curta: 'A senha precisa ter pelo menos 6 caracteres.',
    senha_diferente: 'As senhas não conferem.',
    schema_senha: 'Falta ativar a coluna de senha no banco. Rode a migração de login seguro.',
    schema_celular: 'Falta ativar a coluna de celular no banco. Rode a migração de captação de leads.',
    senha: 'Não consegui salvar sua senha. Tente novamente.',
    senha_obrigatoria: 'Digite sua senha para entrar.',
    senha_incorreta: 'Senha incorreta. Tente novamente.',
  };
  return map[code] || 'Não foi possível continuar. Tente novamente.';
}

const courses = ['Firmar Afinação', 'Aprendendo a Segunda Voz', 'Duetos para Treino', 'Desenvolver Intuição', 'Sala VIP', 'Comunidade'];

export default async function HomePage({ searchParams }: { searchParams?: Promise<LoginSearch> }) {
  const params = searchParams ? await searchParams : {};
  const settings = await getAdminSettings();
  const email = String(params.email || '');
  const setup = params.setup === '1';
  const passwordMode = params.password === '1';
  const error = message(params.erro);

  return (
    <main className="academy-login-page hub-login-page">
      <style dangerouslySetInnerHTML={{ __html: `${focoAcademyLogoCss}${dynamicBrandLogoCss}` }} />
      <section className="academy-login-shell hub-login-shell">
        <aside className="academy-login-brand hub-login-brand">
          <div className="academy-brand-lockup"><DynamicBrandLogo settings={settings} /></div>
          <h1>Sua voz. <span>Seu treino.</span></h1>
          <p>A escola completa para assistir aulas, gravar duetos, postar na comunidade e evoluir com direção.</p>
          <div className="academy-benefits">
            <article><GraduationCap size={24} /><div><strong>Sala de Atividades VIP</strong><span>Um módulo gratuito e todos os módulos para assinantes.</span></div></article>
            <article><PlayCircle size={24} /><div><strong>Aulas e duetos</strong><span>Pratique com vídeos reais e publique sua evolução.</span></div></article>
            <article><Users size={24} /><div><strong>Comunidade vocal</strong><span>Curta, comente, siga alunos e compartilhe vídeos.</span></div></article>
            <article><Star size={24} /><div><strong>Avaliação do professor</strong><span>Assinantes VIP enviam atividades para correção individual.</span></div></article>
          </div>
          <div className="academy-course-grid" aria-hidden="true">
            {courses.map((course, index) => <div className="academy-mini-course" key={course}><small>{index === 0 ? 'Grátis' : 'VIP'}</small><strong>{course}</strong><span>{index + 1}</span></div>)}
          </div>
        </aside>

        <section className="academy-login-panel">
          <div className="academy-login-panel-inner">
            <p className="academy-eyebrow"><Sparkles size={16} /> Acesso seguro</p>
            <h2>{setup ? 'Crie sua senha de acesso' : passwordMode ? 'Bem-vindo(a) de volta' : 'Entre na Escola Foco em Canto'}</h2>
            <p className="academy-muted">
              {setup
                ? 'Este será seu acesso definitivo. Depois disso, ninguém entra apenas sabendo seu e-mail.'
                : passwordMode
                  ? 'Encontramos seu cadastro. Digite sua senha para continuar seu treino.'
                  : 'Faça login para acessar biblioteca, comunidade e atividades.'}
            </p>
            {error ? <div className="academy-login-error">{error}</div> : null}

            {setup ? (
              <form className="academy-login-form" action="/auth/login" method="post">
                <input type="hidden" name="intent" value="set-password" />
                <label><span>E-mail</span><div><Mail size={20} /><input name="email" type="email" required defaultValue={email} placeholder="seu@email.com" /></div></label>
                <label><span>Celular / WhatsApp</span><div><Smartphone size={20} /><input name="whatsapp" type="tel" required inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" /></div></label>
                <label><span>Nova senha</span><div><Lock size={20} /><input name="password" type="password" required minLength={6} placeholder="mínimo 6 caracteres" /></div></label>
                <label><span>Confirmar senha</span><div><Lock size={20} /><input name="confirm_password" type="password" required minLength={6} placeholder="repita a senha" /></div></label>
                <button className="academy-primary-button" type="submit">Criar senha e entrar <span>→</span></button>
              </form>
            ) : passwordMode ? (
              <form className="academy-login-form" action="/auth/login" method="post">
                <input type="hidden" name="intent" value="login" />
                <label><span>E-mail</span><div><Mail size={20} /><input name="email" type="email" required defaultValue={email} placeholder="seu@email.com" /></div></label>
                <label><span>Senha <a href="/">Usar outro e-mail</a></span><div><Lock size={20} /><input name="password" type="password" required placeholder="sua senha" /></div></label>
                <button className="academy-outline-button" type="submit">Entrar <span>→</span></button>
              </form>
            ) : (
              <form className="academy-login-form" action="/auth/login" method="post">
                <input type="hidden" name="intent" value="continue" />
                <label><span>E-mail</span><div><Mail size={20} /><input name="email" type="email" required defaultValue={email} placeholder="seu@email.com" /></div></label>
                <button className="academy-primary-button" type="submit">Continuar <span>→</span></button>
              </form>
            )}

            <div className="academy-first-access"><ShieldCheck size={48} /><div><strong>Primeiro acesso?</strong><p>Informe seu e-mail, crie sua senha e entre na escola.</p></div></div>
            <p className="academy-security"><Lock size={16} /> Seu acesso fica protegido por senha.</p>
          </div>
        </section>
      </section>

      <section className="academy-login-stats">
        <div><Users size={28} /><strong>Comunidade</strong><span>poste duetos</span></div>
        <div><PlayCircle size={28} /><strong>Firmar Afinação</strong><span>módulo grátis</span></div>
        <div><Star size={28} /><strong>VIP</strong><span>avaliação</span></div>
        <div><DynamicBrandLogo settings={settings} compact /><strong>Evolua</strong><span>todos os dias</span></div>
      </section>
    </main>
  );
}
