# Voice Studio — Auditoria arquitetural inicial

Data: 2026-07-19

## Objetivo do PR

Este PR cobre somente a **Etapa 1 — Auditoria completa do Voice Studio**. Nenhuma funcionalidade de DAW foi adicionada neste escopo; a entrega cria uma base verificável para evoluções incrementais sem duplicar stores, providers, timelines, engines ou modelos.

## Arquitetura encontrada

### Rota e composição

- O módulo Voice Studio está concentrado em `app/live/[slug]`, acoplado ao fluxo de salas live.
- A entrada visual principal é `voice-studio-daw.tsx`, com um runtime separado em `voice-studio-daw-runtime.tsx`.
- Existem componentes satélites para manager, mixer, markers, inspector, command palette, ruler e canvas.
- Há arquivos CSS placeholder zerados para o runtime, DAW, MIDI e project manager; a estilização efetiva está majoritariamente inline via constantes CSS nos componentes.

### Modelo oficial do projeto

O modelo tipado central está em `voice-studio-project-model.ts` e já segue a hierarquia correta:

```text
Project
  -> Tracks
    -> Clips
      -> Assets
```

Constatações:

- `VoiceStudioProject` contém `tracks`, `assets`, `regions`, `markers`, `arrangement`, `mixer`, `snap`, `view`, `loop`, `shortcuts`, `editorPreferences` e histórico.
- `VoiceStudioTrack` organiza clips e metadados operacionais de faixa.
- `VoiceStudioClip` representa edição: início, duração, offset de fonte, fades, ganho, mute, lock, cor, grupo e versão.
- `VoiceStudioAsset` representa mídia original: blob url, duração, waveform peaks, metadados de áudio ou notas MIDI.
- `createClipFromAsset` cria clips referenciando assets, sem copiar áudio para a track.

### Estado, stores, providers e contexts

- Não foi encontrado store global dedicado ao Voice Studio.
- Não foi encontrado provider/context específico do Voice Studio.
- O estado parece ser local ao runtime React, com persistência explícita em IndexedDB/localStorage.
- O projeto já possui hooks específicos (`useVoiceStudioTimeline`) em vez de provider global.

Recomendação de arquitetura oficial: manter uma fonte de verdade única no `VoiceStudioProject`; antes de introduzir store/provider, extrair um reducer único de projeto e migrar componentes para comandos tipados.

### Timeline

- O engine puro de timeline está em `voice-studio-timeline-engine.ts`.
- O hook `useVoiceStudioTimeline` controla viewport, scroll, zoom, seek por coordenadas, auto-scroll e wheel zoom.
- `VoiceStudioTimelineRuler` gera régua adaptativa com ticks por compasso/tempo/subdivisão.
- `VoiceStudioTimelineCanvas` renderiza lanes, clips, waveform simplificada, MIDI notes, playhead e clip ao vivo de gravação.
- O status anterior do módulo informa que a integração do runtime principal com a timeline PRO já era uma pendência planejada.

### Playback

- O runtime DAW possui controle de status (`idle`, `countin`, `recording`, `playing`) e playhead/elapsed.
- A auditoria não identificou um playback engine desacoplado para o Voice Studio equivalente a um clock central de DAW.
- Há engines de áudio em outros módulos (`lib/audio` e `lib/audio-v2`) focados em duet/recorder, mas não devem ser reutilizados diretamente sem adaptação porque representam outro domínio.

### Recording

- O runtime DAW concentra gravação via APIs nativas de navegador.
- O modelo separa asset criado da gravação e clip posicionado na timeline.
- Existe suporte conceitual a track arm e gravação live no canvas.
- Count-in, overdub, punch-in/punch-out e monitor profissional ainda não aparecem como serviços isolados do Voice Studio.

### Waveforms e renderização

- Waveforms são representadas por arrays de peaks no asset.
- A renderização atual usa SVG por clip e recorta visualmente os peaks conforme `sourceOffset`/`duration`.
- Não foi identificada virtualização/lazy render/cache incremental dedicado além do cache persistido no asset.
- Como evolução, a camada de waveform deve permanecer ligada ao Asset, nunca à Track.

### Persistência

- `voice-studio-project-storage.ts` usa IndexedDB para projetos e biblioteca local de áudio.
- `voice-studio-autosave.ts` usa localStorage para snapshots/autosave/recovery.
- O modelo suporta serialização para export/import do projeto, removendo `blobUrl` transitório.
- Há duas persistências complementares: IndexedDB para dados principais/biblioteca e localStorage para recovery rápido. Elas não são fluxos paralelos para a mesma responsabilidade, mas precisam de fronteiras documentadas.

### APIs nativas

- IndexedDB é acessado por wrappers utilitários locais.
- Web Audio aparece para leitura/decodificação e criação de peaks.
- MediaDevices/MediaRecorder aparecem no runtime/gravação.
- Web MIDI aparece no modelo e arquivos MIDI do módulo.
- Recomendação: isolar MediaRecorder/WebAudio/WebMIDI em adapters dedicados antes de novas features para não acoplar componentes React a APIs nativas.

## Arquivos analisados

- `app/live/[slug]/use-voice-studio-timeline.ts`
- `app/live/[slug]/voice-studio-add-track-runtime.tsx`
- `app/live/[slug]/voice-studio-autosave.ts`
- `app/live/[slug]/voice-studio-clip-inspector.tsx`
- `app/live/[slug]/voice-studio-command-palette.tsx`
- `app/live/[slug]/voice-studio-daw-runtime.tsx`
- `app/live/[slug]/voice-studio-daw.tsx`
- `app/live/[slug]/voice-studio-markers.tsx`
- `app/live/[slug]/voice-studio-midi.css`
- `app/live/[slug]/voice-studio-mixer.tsx`
- `app/live/[slug]/voice-studio-project-manager.css`
- `app/live/[slug]/voice-studio-project-manager.tsx`
- `app/live/[slug]/voice-studio-project-model.ts`
- `app/live/[slug]/voice-studio-project-storage.ts`
- `app/live/[slug]/voice-studio-timeline-canvas.tsx`
- `app/live/[slug]/voice-studio-timeline-engine.ts`
- `app/live/[slug]/voice-studio-timeline-pro-status.md`
- `app/live/[slug]/voice-studio-timeline-ruler.tsx`
- `docs/voice-studio-core-build-fixes.md`
- `README.md`
- Busca ampla por Voice Studio, DAW, timeline, playback, recording, waveform, track, clip e asset.

## Problemas identificados

1. **Runtime principal grande demais**: `voice-studio-daw-runtime.tsx` concentra muitas responsabilidades que deveriam migrar para reducer, services e adapters.
2. **Sem playback engine oficial desacoplado**: há controle de playhead/status, mas não um clock/transport service único com loop, latência e sincronismo.
3. **Sem store/reducer oficial do projeto**: alterações de projeto tendem a ficar espalhadas em callbacks.
4. **CSS fragmentado/inconsistente**: alguns arquivos CSS existem vazios enquanto componentes injetam CSS por constantes.
5. **Timeline PRO parcialmente documentada como pendente**: o status file antigo declara integração pendente; deve ser revalidado antes da Etapa 2.
6. **Waveform sem virtualização dedicada**: SVG por clip é simples e correto para o estado atual, mas não escala como DAW profissional.
7. **Adapters de APIs nativas insuficientes**: IndexedDB tem wrapper, mas MediaRecorder/Web Audio/Web MIDI ainda precisam de fronteiras mais claras.
8. **Autosave e IndexedDB carecem de contrato explícito**: ambos são válidos, porém a responsabilidade de cada camada deve ser preservada para evitar persistência paralela.

## Estratégia recomendada

1. Manter `VoiceStudioProject` como modelo oficial e única fonte de verdade.
2. Na Etapa 2, trabalhar somente em Timeline: zoom, scroll, snapping, playhead, grid, ruler, fit project e fit selection.
3. Antes de mexer na timeline, reler integralmente os arquivos envolvidos e confirmar se `voice-studio-daw.tsx` já consome `useVoiceStudioTimeline` e `VoiceStudioTimelineCanvas`.
4. Extrair funções puras para `voice-studio-timeline-engine.ts` sempre que possível.
5. Evitar criar provider/store enquanto não houver necessidade comprovada; quando necessário, criar um reducer oficial único para o Project.
6. Manter mídia exclusivamente no Asset e edição exclusivamente no Clip.

## Critérios de validação para próximos PRs

- Build, typecheck e lint devem ser executados.
- Teste manual da rota live/Voice Studio deve validar criação/carregamento de projeto, gravação, seek, scroll, zoom, seleção de clips e autosave.
- Auditoria de performance deve verificar listeners, effects, callbacks, renderização de waveform e re-renderizações por playhead.
