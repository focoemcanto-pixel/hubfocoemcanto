export default function SignupPage() {
  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Primeiro acesso</p>
        <h1 className="hero-title">Crie sua conta no Hub</h1>
        <p className="muted">Cadastre-se com o mesmo email usado na compra do Grupo VIP.</p>
        <form className="stack" action="/auth/signup" method="post">
          <label>Nome<input name="name" required placeholder="Seu nome" /></label>
          <label>Email<input name="email" type="email" required placeholder="seuemail@gmail.com" /></label>
          <label>WhatsApp<input name="whatsapp" placeholder="(00) 00000-0000" /></label>
          <label>Senha<input name="password" type="password" required minLength={6} placeholder="Crie uma senha" /></label>
          <button className="button" type="submit">Criar acesso</button>
        </form>
      </section>
    </main>
  );
}
