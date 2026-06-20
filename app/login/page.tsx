export default function LoginPage() {
  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Acesso VIP</p>
        <h1 className="hero-title">Entre com seu e-mail de compra</h1>
        <p className="muted">Sem senha. Informe o mesmo e-mail usado na Kiwify e receba um link seguro para acessar o Hub.</p>
        <form className="stack" action="/auth/login" method="post">
          <label>Email de compra<input name="email" type="email" required placeholder="seuemail@gmail.com" /></label>
          <button className="button" type="submit">Receber link de acesso</button>
        </form>
        <div className="card" style={{ marginTop: 18 }}>
          <strong>Como funciona?</strong>
          <p className="muted">O acesso é liberado automaticamente quando seu pagamento ou renovação está ativo na Kiwify.</p>
        </div>
      </section>
    </main>
  );
}
