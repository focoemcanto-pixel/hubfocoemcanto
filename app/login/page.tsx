export default function LoginPage() {
  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Hub Foco em Canto</p>
        <h1 className="hero-title">Entre no seu treino vocal</h1>
        <p className="muted">Acesse o VIP, envie atividades e acompanhe suas avaliações em uma área exclusiva.</p>
        <form className="stack" action="/auth/login" method="post">
          <label>Email<input name="email" type="email" required placeholder="seuemail@gmail.com" /></label>
          <label>Senha<input name="password" type="password" required placeholder="Sua senha" /></label>
          <button className="button" type="submit">Entrar no Hub</button>
        </form>
        <div className="card" style={{ marginTop: 18 }}>
          <strong>Primeiro acesso?</strong>
          <p className="muted">Crie sua conta usando o mesmo email da compra na Kiwify. O sistema verifica sua assinatura para liberar o conteúdo.</p>
          <a className="button secondary" href="/cadastro">Criar minha conta</a>
        </div>
      </section>
    </main>
  );
}
