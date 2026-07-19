# Voice Studio Timeline PRO — Professional Timeline

Status deste PR:

- `voice-studio-daw.tsx` consome a arquitetura oficial `useVoiceStudioTimeline`.
- A renderização da timeline passa pelo renderer oficial `VoiceStudioTimelineCanvas`.
- A escala horizontal usa o engine oficial em pixels (`voice-studio-timeline-engine.ts`).
- Ruler adaptativo, grid, playhead e loop visual são renderizados pelo módulo oficial da timeline.
- Scroll horizontal e vertical ficam no container oficial `.vs-timeline`.
- Zoom horizontal persiste em `project.view.zoom` e `project.view.scrollLeft`.
- Zoom vertical é local de UI e controla `--vs-track-height`, sem criar store novo.
- Fit Project e Fit Selection usam somente o viewport oficial e a escala oficial.
- Auto scroll mantém o playhead visível durante playback/gravação via `ensureTimeVisible`.
- Snapping segue `project.settings.snapping` e `project.settings.snapDivision`.
- Seleção e cursor foram alinhados ao canvas pixel-based.

Escopo intencional:

- Não há novo store.
- Não há novo renderer.
- Não há nova arquitetura.
- Este PR não adiciona novas operações de edição de clips; apenas preserva os handlers existentes enquanto corrige escala, viewport, seleção e sincronização visual.
