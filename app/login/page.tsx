export default function LoginPage() {
  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Hub Foco em Canto</p>
        <h1 className="hero-title">Entre no seu treino vocal</h1>
        <p className="muted">Acesse o VIP, envie atividades e acompanhe suas avaliações.</p>
        <form className="stack" action="/auth/login" method="post">
          <label>Email<input name="email" type="email" required placeholder="seuemail@gmail.com" /></label>
          <label>Senha<input name="password" type="password" required placeholder="Sua senha" /></label>
          <button className="button" type="submit">Entrar</button>
        </form>
        <p className="muted">Primeiro acesso? Use o mesmo email da compra na Kiwify.</p>
      </section>
    </main>
  );
}
