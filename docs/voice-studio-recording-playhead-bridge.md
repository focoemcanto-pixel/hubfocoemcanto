# Voice Studio — Recording Playhead Bridge

## Objetivo

Remover o último uso visual do relógio local `elapsed` dentro da Timeline enquanto a captura de áudio/MIDI ainda permanece no controlador legado.

## Fluxo

```text
Legacy recording status + recordStart
                ↓
useVoiceStudioLegacyRecordingPlayheadBridge
                ↓
PLAYHEAD_CHANGED
                ↓
PlayheadStore
                ↓
Timeline ruler, cursor and live recording width
```

## Responsabilidade da ponte

A ponte publica somente tempo visual. Ela não controla:

- `MediaRecorder`;
- stream do microfone;
- captura MIDI;
- peaks de áudio;
- commit de assets;
- criação de clips;
- cancelamento da gravação.

Essas responsabilidades continuam no controlador legado até a migração completa de Recording.

## Atualização visual

Durante `recording`, a ponte usa `requestAnimationFrame` e limita publicações para aproximadamente 30 atualizações por segundo.

Durante `countin`, o playhead permanece no ponto inicial da gravação.

Ao desmontar ou mudar de estado, o frame pendente é cancelado.

## Timeline

`VoiceStudioTimelineCanvas` usa o mesmo `visualPlayhead` para:

- régua;
- cursor;
- largura do preview de gravação.

A prop `elapsed` permanece opcional e depreciada apenas porque o controlador legado ainda a envia. Ela não participa de cálculos visuais.

## Próxima remoção

Quando o controlador legado deixar de passar `elapsed`, a prop poderá ser removida sem alterar comportamento.
