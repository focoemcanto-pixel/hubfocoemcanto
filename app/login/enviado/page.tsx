export default function LoginSentPage() {
  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Link enviado</p>
        <h1 className="hero-title">Confira seu e-mail</h1>
        <p className="muted">Enviamos um link seguro para você entrar no Hub. Abra pelo mesmo dispositivo para acessar sua área VIP.</p>
        <a className="button secondary" href="/login">Usar outro e-mail</a>
      </section>
    </main>
  );
}
