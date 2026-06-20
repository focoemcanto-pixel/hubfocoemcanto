export default function BlockedAccessPage() {
  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Acesso bloqueado</p>
        <h1 className="hero-title">Assinatura VIP inativa</h1>
        <p className="muted">O conteúdo é liberado automaticamente quando o pagamento está ativo na Kiwify.</p>
        <a className="button" href="/login">Tentar outro e-mail</a>
      </section>
    </main>
  );
}
