# Voice Studio — Continuous Scrubbing

A régua da Timeline agora usa Pointer Events e captura explícita do ponteiro.

Fluxo:

```text
pointerdown
  -> setPointerCapture
  -> seek
pointermove
  -> seek
pointermove
  -> seek
pointerup
  -> seek final
  -> releasePointerCapture
```

O `onSeek` existente continua sendo o único ponto de integração. Portanto, Timeline, playhead e playback recebem as atualizações pelo fluxo já existente, sem introduzir novo store, command ou controller.

Garantias:

- atualização contínua enquanto o ponteiro estiver pressionado;
- interação mantida mesmo quando o cursor sai da régua;
- posição limitada entre zero e a duração do projeto;
- cancelamento seguro em `pointercancel` e `lostpointercapture`;
- suporte consistente para mouse, caneta e toque;
- nenhuma alteração arquitetural.
