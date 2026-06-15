export default function SubmitPage() {
  return (
    <main className="page">
      <section className="card">
        <h1>Enviar atividade</h1>
        <p>Na próxima etapa, esta tela terá upload de vídeo ou áudio, escolha de exercício, opção privada ou publicar na comunidade.</p>
        <form>
          <p><label>Exercício<br /><input placeholder="Nome do exercício" /></label></p>
          <p><label>Observação<br /><textarea placeholder="Conte como foi seu treino" /></label></p>
          <button className="button" type="button">Enviar para avaliação</button>
        </form>
      </section>
    </main>
  );
}
