export default function SignupPage() {
  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Cadastro automático</p>
        <h1 className="hero-title">Seu acesso nasce na Kiwify</h1>
        <p className="muted">Você não precisa criar senha. Após a compra ou renovação do VIP, seu e-mail é liberado automaticamente no Hub.</p>
        <div className="card" style={{ marginTop: 18 }}>
          <strong>Já comprou?</strong>
          <p className="muted">Use o mesmo e-mail da compra para receber um link seguro de entrada.</p>
          <a className="button" href="/login">Acessar com meu e-mail</a>
        </div>
      </section>
    </main>
  );
}
