# Foco Keys — plano de validação

## Objetivo
Validar o piano integrado sem interferir na instância Daily que controla a sala, além de confirmar que palco, ofertas, chat e controles continuam utilizáveis em desktop e mobile.

## Matriz de dispositivos

- Chrome desktop: 1366×768 e 1920×1080
- Safari macOS
- Chrome Android em retrato e paisagem
- Safari iPhone em retrato e paisagem
- iPad/Safari em retrato e paisagem

## Piano

1. Entrar como host e confirmar que o botão **Piano** só aparece depois que a sala foi carregada.
2. Abrir o Foco Keys e verificar que o palco reduz ou se reorganiza, sem ser coberto.
3. Tocar com mouse, toque e teclado do computador.
4. Confirmar notas simultâneas e iluminação das teclas.
5. Alterar oitava, volume e sustain.
6. Conectar um controlador MIDI em navegador compatível.
7. Entrar com outro dispositivo e confirmar que:
   - o painel abre quando o host abre;
   - o aluno escuta os mesmos samples;
   - as teclas tocadas acendem;
   - o aluno não consegue tocar no piano do professor.
8. Fechar o piano e confirmar que o palco volta ao tamanho normal.
9. Entrar depois que o piano já estiver aberto e confirmar sincronização do estado.

## Ofertas

1. Testar Tela dividida, CTA e Botão sem piano.
2. Abrir o piano com cada modo de oferta ativo.
3. Confirmar que o vídeo nunca é desmontado nem fica oculto.
4. Em celular retrato, Tela dividida deve mostrar vídeo primeiro e oferta abaixo.
5. Em celular paisagem, Tela dividida deve manter vídeo e oferta lado a lado.
6. Confirmar que os três botões de cada oferta permanecem legíveis e apenas o modo ativo fica destacado.

## Regressões críticas

- entrada de host e convidados;
- câmera e microfone;
- compartilhamento de tela;
- chat e rolagem automática;
- gravação;
- sala de espera;
- troca de layout Aula/Grade/Automático;
- encerramento da live.

## Critério de aceite

A funcionalidade só deve ser mesclada quando não houver sobreposição sobre os controles, desaparecimento do vídeo, scroll preso ou perda do áudio da chamada em nenhuma das orientações testadas.
