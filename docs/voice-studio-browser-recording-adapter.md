# Voice Studio Browser Recording Adapter

Este módulo concentra a fronteira nativa de gravação de áudio do navegador:

- solicitação de permissão com `getUserMedia`;
- criação e início do `MediaRecorder`;
- coleta dos chunks;
- consolidação do `Blob` final;
- cancelamento e descarte idempotentes;
- encerramento de todas as tracks, inclusive quando a preparação falha.

O adapter ainda não substitui o fluxo concreto dentro do controlador monolítico. Esta etapa cria a fronteira testável que será ligada ao `session.recordingCapture` na próxima PR.

O commit de assets, geração de peaks, monitoramento e inserção de clips continuam fora deste módulo.
