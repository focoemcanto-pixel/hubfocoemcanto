# Auditoria do motor de duetos

Problema encontrado no fluxo atual:

- O preview usa elementos de mídia separados (`video`, `audio`, `video`) e tenta corrigir sincronia por `currentTime`.
- Trocar presets altera o grafo WebAudio enquanto os elementos HTML continuam tocando em clocks diferentes.
- A voz do aluno vem sem normalização automática, por isso pode sumir mesmo com volume alto.
- A referência pode continuar porque não existe um único clock mestre controlando todas as faixas.

Correção iniciada:

- Criado `lib/audio/duet-buffer-engine.ts`.
- Esse motor usa `AudioBufferSourceNode` para voz e referência no mesmo `AudioContext`.
- O vídeo fica mudo e segue o clock do áudio.
- Os presets alteram parâmetros de uma cadeia fixa, sem recriar o grafo.
- A voz recebe normalização automática de RMS antes do ganho do slider.

Próximo passo:

- Conectar `components/duet-recorder.tsx` ao novo `DuetBufferEngine`.
- Remover o preview atual baseado em três media elements.
- Fazer o envio renderizar o arquivo final com os volumes/preset escolhidos.
