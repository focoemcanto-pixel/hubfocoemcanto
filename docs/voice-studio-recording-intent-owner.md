# Voice Studio — Recording Intent Owner

## Objetivo

Transferir para a UI ligada à `VoiceStudioSession` a propriedade dos comandos de iniciar e parar gravação, sem migrar ainda a captura de áudio e MIDI.

## Novo fluxo

```text
Botão Record / tecla R
          ↓
Session Transport UI
          ↓
Legacy Recording Intent Bridge
          ↓
Captura legada existente
```

A ponte é temporária. Ela aciona o botão legado oculto, preservando o fluxo atual de microfone, MIDI, count-in, peaks, assets e commit.

## Estado espelhado

Um `MutationObserver` acompanha três estados visuais:

- `idle`;
- `countin`;
- `recording`.

Esses estados atualizam o Transport oficial:

```text
countin   → transport.beginCountIn()
recording → transport.beginRecording()
idle      → transport.endRecording(playhead)
```

## Atalho R

O `VoiceStudioTransportKeyboardOwner` passou a possuir também a tecla `R`.

Ele:

1. ignora campos editáveis e combinações com modificadores;
2. bloqueia propagação para o listener legado;
3. envia a intenção pelo bridge oficial.

## Escopo preservado

Esta etapa não altera:

- `MediaRecorder`;
- `getUserMedia`;
- captura MIDI;
- monitoramento;
- peaks ao vivo;
- backing tracks;
- criação de assets;
- commit e cancelamento.

## Próxima etapa

Migrar a captura real para `VoiceStudioRecording`, substituindo o clique no botão legado por uma implementação Session-backed completa.
