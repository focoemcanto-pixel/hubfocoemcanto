import { GraduationCap, Lock, Mail, PlayCircle, ShieldCheck, Sparkles, Star, Users, Waves } from 'lucide-react';

type LoginSearch = { email?: string; setup?: string; password?: string; erro?: string };

function message(code?: string) {
  if (!code) return '';
  const map: Record<string, string> = {
    email: 'Informe um e-mail válido.',
    perfil: 'Não consegui preparar seu perfil agora. Tente novamente.',
    senha_curta: 'A senha precisa ter pelo menos 6 caracteres.',
    senha_diferente: 'As senhas não conferem.',
    schema_senha: 'Falta ativar a coluna de senha no banco. Rode a migração de login seguro.',
    senha: 'Não consegui salvar sua senha. Tente novamente.',
    senha_obrigatoria: 'Digite sua senha para entrar.',
    senha_incorreta: 'Senha incorreta. Tente novamente.',
  };
  return map[code] || 'Não foi possível continuar. Tente novamente.';
}

const courses = ['Técnica Vocal do Zero', 'Ressonância e Projeção', 'Afinação na Prática', 'Interpretação com Verdade', 'Exercícios Avançados', 'Criatividade e Improviso'];

export default async function HomePage({ searchParams }: { searchParams?: Promise<LoginSearch> }) {
  const params = searchParams ? await searchParams : {};
  const email = String(params.email || '');
  const setup = params.setup === '1';
  const passwordMode = params.password === '1';
  const error = message(params.erro);

  return (
    <main className="academy-login-page">
      <section className="academy-login-shell">
        <aside className="academy-login-brand">
          <div className="academy-logo-mark"><Waves size={36} /></div>
          <div className="academy-wordmark"><strong>Foco em Canto</strong><span>Academy</span></div>
          <h1>Sua voz. <span>Seu caminho.</span></h1>
          <p>A plataforma completa para transformar técnica, expressão e talento em propósito.</p>
          <div className="academy-benefits">
            <article><GraduationCap size={24} /><div><strong>Todos os cursos</strong><span>Aprenda no seu ritmo com acesso à escola.</span></div></article>
            <article><PlayCircle size={24} /><div><strong>Aulas e exercícios</strong><span>Conteúdo prático para evoluir sempre.</span></div></article>
            <article><Users size={24} /><div><strong>Comunidade exclusiva</strong><span>Compartilhe vídeos, curta e comente.</span></div></article>
            <article><Star size={24} /><div><strong>Evolução contínua</strong><span>Novos conteúdos para levar sua voz mais longe.</span></div></article>
          </div>
          <div className="academy-course-grid" aria-hidden="true">
            {courses.map((course, index) => <div className="academy-mini-course" key={course}><small>Curso</small><strong>{course}</strong><span>{index + 8}</span></div>)}
          </div>
        </aside>

        <section className="academy-login-panel">
          <div className="academy-login-panel-inner">
            <p className="academy-eyebrow"><Sparkles size={16} /> Acesso seguro</p>
            <h2>{setup ? 'Crie sua senha de acesso' : passwordMode ? 'Bem-vindo(a) de volta' : 'Entre na Foco em Canto Academy'}</h2>
            <p className="academy-muted">
              {setup
                ? 'Este será seu acesso definitivo. Depois disso, ninguém entra apenas sabendo seu e-mail.'
                : passwordMode
                  ? 'Encontramos seu cadastro. Confirme sua senha para continuar sua evolução.'
                  : 'Faça login para acessar seus cursos, comunidade e atividades.'}
            </p>
            {error ? <div className="academy-login-error">{error}</div> : null}

            {setup ? (
              <form className="academy-login-form" action="/auth/login" method="post">
                <input type="hidden" name="intent" value="set-password" />
                <label><span>E-mail</span><div><Mail size={20} /><input name="email" type="email" required defaultValue={email} placeholder="seu@email.com" /></div></label>
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

            <div className="academy-first-access"><ShieldCheck size={48} /><div><strong>Primeiro acesso?</strong><p>Vamos criar sua conta e você escolherá uma senha segura.</p></div></div>
            <p className="academy-security"><Lock size={16} /> Seus dados estão protegidos com segurança.</p>
          </div>
        </section>
      </section>

      <section className="academy-login-stats">
        <div><Users size={28} /><strong>+30.000</strong><span>alunos</span></div>
        <div><PlayCircle size={28} /><strong>+500</strong><span>aulas</span></div>
        <div><Star size={28} /><strong>24/7</strong><span>acesso</span></div>
        <div><Waves size={28} /><strong>Transforme</strong><span>sua voz</span></div>
      </section>
    </main>
  );
}
