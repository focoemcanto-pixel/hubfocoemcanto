import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';

export default async function SubmitPage() {
  const supabase = await createClient();
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id,title')
    .eq('is_active', true)
    .order('sort_order');

  return (
    <AppShell>
      <main className="page">
        <section className="card">
          <p className="eyebrow">Avaliação</p>
          <h1 className="hero-title">Enviar atividade</h1>
          <p className="muted">Escolha o exercício, envie sua gravação e receba uma avaliação com estrelas e comentário.</p>
          <form className="stack" action="/api/submissions" method="post">
            <label>Exercício
              <select name="exercise_id" required>
                {(exercises || []).map((exercise) => (
                  <option value={exercise.id} key={exercise.id}>{exercise.title}</option>
                ))}
              </select>
            </label>
            <label>Link do vídeo ou áudio
              <input name="file_url" placeholder="Cole o link do Drive, R2 ou gravação" required />
            </label>
            <label>Observação
              <textarea name="note" placeholder="Conte como foi seu treino" />
            </label>
            <label>Privacidade
              <select name="visibility" defaultValue="private">
                <option value="private">Somente professor</option>
                <option value="community">Publicar na comunidade</option>
              </select>
            </label>
            <button className="button" type="submit">Enviar para avaliação</button>
          </form>
        </section>
      </main>
    </AppShell>
  );
}
