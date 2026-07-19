# Voice Studio — Core Migration da DAW

Data: 2026-07-19

## Auditoria executada

- Arquivos completos do Voice Studio em `app/live/[slug]` foram relidos antes da alteração, com foco no modelo de projeto, runtime principal, runtime de portal/importação, persistência e timeline.
- A auditoria confirmou o PR anterior relacionado no histórico local: merge do PR #75 (`codex/auditar-arquitetura-do-voice-studio`) seguido do commit `docs: audit voice studio architecture`.
- A CLI do GitHub não está instalada neste ambiente, portanto a verificação remota de PRs abertos relacionados não pôde ser executada pelo comando `gh pr list`.

## Problemas encontrados

1. A criação de mídia gravada ainda montava `Asset`, `Track` e `Clip` diretamente no componente principal da DAW.
2. A importação por drag/drop ou botão criava manualmente uma `Track` nova com `Clip` embutido, duplicando a regra arquitetural fora do modelo oficial.
3. A normalização de projetos não removia campos legados de mídia caso um snapshot antigo trouxesse áudio, waveform, trims ou offsets diretamente em `Track`.
4. O playback e a renderização visual já percorriam `Track -> Clip -> Asset`, mas dependiam de uma criação de projeto ainda descentralizada.

## Arquivos alterados

- `app/live/[slug]/voice-studio-project-model.ts`
  - Adiciona helpers oficiais para criar containers de track e clips a partir de assets.
  - Centraliza a inserção de mídia no projeto por `Asset -> Clip -> Track`.
  - Saneia campos legados de mídia em tracks durante a normalização.
- `app/live/[slug]/voice-studio-daw.tsx`
  - Remove montagem manual de track/clip/asset ao finalizar gravações.
  - Passa a criar gravações pelo helper oficial do modelo.
- `app/live/[slug]/voice-studio-daw-runtime.tsx`
  - Remove montagem manual de tracks na importação de áudio.
  - Tipa snapshots com `VoiceStudioProject` e usa o helper oficial do modelo.

## Arquitetura final consolidada

```text
Project
  -> Tracks: containers operacionais, sem áudio, waveform, trims ou offsets
    -> Clips: edição, posição, duração, sourceOffset, fades, ganho, mute e lock
      -> Assets: mídia original, duração, peaks/waveform, MIDI notes, MIME e metadados
```

- `Track` permanece somente como container e estado de faixa: nome, tipo, cor, mute, solo, volume, pan, instrumento e lista de clips.
- `Clip` concentra toda edição temporal: início, duração, offset de origem, fades, ganho, mute, lock, grupo e asset referenciado.
- `Asset` concentra toda mídia: duração original, peaks/waveform, notas MIDI, MIME, arquivo e metadados.
- Split, move, resize, duplicate, paste e delete continuam operando sobre `Clip` via funções puras do modelo.
- Playback e renderização resolvem mídia exclusivamente por `clip.assetId -> project.assets[assetId]`.
- Persistência salva `Project` e blobs por `assetId`, sem blob ou waveform em `Track`.

## Próximo PR recomendado

Extrair um reducer/command layer único para operações do `VoiceStudioProject`, mantendo o escopo apenas em comandos internos já existentes. Não iniciar Timeline nova, Mixer ou Export nesse próximo passo.
