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

export default async function LoginPage({ searchParams }: { searchParams?: Promise<LoginSearch> }) {
  const params = searchParams ? await searchParams : {};
  const email = String(params.email || '');
  const setup = params.setup === '1';
  const passwordMode = params.password === '1';
  const error = message(params.erro);

  return (
    <main className="page auth-page secure-login-page">
      <section className="card auth-card secure-login-card">
        <p className="eyebrow">Hub Foco em Canto</p>
        <h1 className="hero-title">{setup ? 'Crie sua senha de acesso' : passwordMode ? 'Digite sua senha' : 'Entre no Hub com segurança'}</h1>
        <p className="muted">
          {setup
            ? 'Este será seu acesso definitivo ao Hub. Depois disso, ninguém entra apenas sabendo seu e-mail.'
            : passwordMode
              ? 'Encontramos seu cadastro. Agora confirme sua senha para entrar.'
              : 'Informe seu e-mail primeiro. Se for seu primeiro acesso, você cria uma senha. Se ainda não tiver curso, entra com acesso social à comunidade.'}
        </p>
        {error ? <div className="notice danger">{error}</div> : null}

        {setup ? (
          <form className="stack" action="/auth/login" method="post">
            <input type="hidden" name="intent" value="set-password" />
            <label>Email<input name="email" type="email" required defaultValue={email} placeholder="seuemail@gmail.com" /></label>
            <label>Nova senha<input name="password" type="password" required minLength={6} placeholder="mínimo 6 caracteres" /></label>
            <label>Confirmar senha<input name="confirm_password" type="password" required minLength={6} placeholder="repita a senha" /></label>
            <button className="button" type="submit">Criar senha e entrar</button>
          </form>
        ) : passwordMode ? (
          <form className="stack" action="/auth/login" method="post">
            <input type="hidden" name="intent" value="login" />
            <label>Email<input name="email" type="email" required defaultValue={email} placeholder="seuemail@gmail.com" /></label>
            <label>Senha<input name="password" type="password" required placeholder="sua senha" /></label>
            <button className="button" type="submit">Entrar</button>
            <a className="muted" href="/login">Usar outro e-mail</a>
          </form>
        ) : (
          <form className="stack" action="/auth/login" method="post">
            <input type="hidden" name="intent" value="continue" />
            <label>Email<input name="email" type="email" required defaultValue={email} placeholder="seuemail@gmail.com" /></label>
            <button className="button" type="submit">Continuar</button>
          </form>
        )}

        <div className="card" style={{ marginTop: 18 }}>
          <strong>Como funciona?</strong>
          <p className="muted">Alunos com curso ativo veem as aulas liberadas. Quem ainda não comprou pode criar perfil, participar da comunidade, curtir, comentar e publicar vídeos.</p>
        </div>
      </section>
    </main>
  );
}
