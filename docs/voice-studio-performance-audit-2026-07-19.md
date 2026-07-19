# Auditoria de performance — Voice Studio

Data: 2026-07-19

Escopo analisado:

- composição React e Provider;
- Timeline nova e canvas legado;
- controlador legado da DAW;
- EventBus e Session;
- Playback e criação de AudioNodes;
- Runtime, ObjectURLs e caches de áudio/waveform;
- persistência e criação de URLs no fluxo legado.

## Resumo executivo

A arquitetura nova possui bons limites de responsabilidade, mas a aplicação ainda opera com dois caminhos paralelos:

1. Session/EventBus/Runtime novos;
2. `voice-studio-daw-controller.tsx` legado, ainda responsável pela interface em produção.

Os principais custos atuais são:

- rerender amplo do controlador legado durante playback e recording;
- atualização React em frequência de `requestAnimationFrame` para o playhead;
- criação de funções e objetos no componente legado a cada render;
- retenção de AudioNodes MIDI até o encerramento do playback;
- coexistência de dois gerenciamentos de ObjectURL durante a migração.

Foram implementadas apenas otimizações sem alteração funcional:

- Session estável no `VoiceStudioProvider`;
- memoização das lanes da nova Timeline;
- reutilização do waveform vazio.

## 1. Renders React

### Nova Timeline

`VoiceStudioTimelineView` recebe `PLAYHEAD_CHANGED` em frequência de animação e atualiza seu ViewModel. Isso rerenderiza o componente raiz da Timeline para mover o playhead.

Antes da otimização, cada atualização também executava novamente todas as `TimelineLane`, reconstruindo a lista de clips, mesmo quando Project, tracks e assets não mudavam.

Otimização aplicada:

- `TimelineLane` passou a usar `memo()`;
- durante mudanças exclusivas do playhead, tracks com referências estáveis não renderizam novamente;
- `TimelineClip` e `Wave` já estavam memoizados.

Risco: baixo. Não há mudança de dados, eventos ou renderização final.

### Controlador legado

O controlador legado atualiza:

- `elapsed`;
- `project.view.playhead`;

em cada tick de playback. Isso produz duas filas de atualização React e recria o componente grande com dezenas de estados, refs, efeitos e handlers.

Não otimizado nesta PR porque consolidar os dois estados pode afetar:

- snapshot externo;
- scroll automático;
- atalhos;
- gravação;
- seleção;
- histórico.

Recomendação posterior: retirar playback/recording do controlador legado e fazer regiões específicas assinarem snapshots menores da Session.

## 2. Memoizações

### Adequadas

- `TimelineClip` usa `memo()`;
- `Wave` usa `memo()`;
- marcas da régua usam `useMemo()` por duração;
- contexto do Provider usa `useMemo()` para seu value.

### Ausentes ou pouco efetivas

- lanes da Timeline não estavam memoizadas;
- o controlador legado recria funções declaradas dentro do componente;
- callbacks passados ao canvas legado mudam em todo render, reduzindo o benefício de memoização dos filhos;
- o objeto `project` é recriado durante ticks, ainda que tracks e assets permaneçam iguais.

Otimização aplicada: memoização das lanes da nova Timeline.

Não foi adicionada memoização artificial a cálculos simples. Memorizar aritmética pequena aumentaria complexidade sem benefício mensurável.

## 3. Recriações e alocações

### Provider

A Session era criada dentro de um `useMemo` dependente de `readOnly`. Alterar `readOnly` recriava:

- EventBus;
- Runtime;
- Transport;
- Playback;
- Recording;
- AssetStore;
- ProjectActions;
- Project inicial.

Isso também invalidava assinaturas e caches associados à Session anterior.

Otimização aplicada:

- Session criada uma única vez e armazenada em `useRef`;
- alteração de `readOnly` muda apenas o value do contexto;
- estado e infraestrutura da Session permanecem estáveis.

### Waveform vazio

`Wave` criava um array de 80 pontos sempre que recebia `peaks` vazio e precisava renderizar.

Otimização aplicada:

- waveform vazio movido para constante compartilhada e congelada.

### Controlador legado

Há recriação por render de:

- handlers de teclado;
- funções de edição;
- funções de playback e recording;
- objetos de props para o canvas;
- closures que capturam Project, selection, status e elapsed.

Não alterado nesta PR. A solução correta é decomposição por região, não adicionar dezenas de `useCallback` ao componente legado.

## 4. AudioNodes

### Runtime novo

O Runtime mantém um único `AudioContext` lazy por Session e fecha o contexto em `dispose()`. Isso evita múltiplos contextos por operação.

### Playback novo

Para áudio:

- cria `HTMLAudioElement`;
- cria `MediaElementAudioSourceNode`;
- cria `GainNode`;
- desconecta source e gain no descarte.

Para MIDI:

- cria `OscillatorNode` e `GainNode` por nota;
- chama `stop()` no oscillator;
- mantém referências em `#nodes` até `stop()`/fim do playback.

Impacto: em projetos MIDI longos ou densos, a lista pode crescer durante toda a reprodução, mesmo após nodes terminarem.

Não alterado nesta PR porque a remoção antecipada precisa ser testada contra:

- loop;
- stop durante lookahead;
- browsers com diferenças no evento `ended`;
- desconexão idempotente.

Recomendação posterior: armazenar pares `{ source, gain }`, remover em `source.onended` e manter fallback no cleanup global.

### Controlador legado

O controlador mantém Map de vozes MIDI ao vivo e encerra osciladores ao receber note-off/cleanup. O fluxo possui cleanup explícito, mas permanece acoplado ao ciclo React.

## 5. ObjectURLs

### Runtime/AssetStore novos

O Runtime usa Map por `assetId` e:

- revoga URL anterior antes de registrar uma nova;
- revoga por asset removido;
- revoga todas no `dispose()`.

O AssetStore delega URL e cache ao Runtime. Esse é o caminho recomendado.

### Fluxo legado

`voice-studio-project-storage.ts` cria URLs em lote e o controlador legado mantém `objectUrlsRef`.

Pontos positivos:

- URLs são revogadas ao trocar projeto;
- URLs são revogadas no cleanup do componente.

Risco arquitetural:

- durante a migração existem dois proprietários potenciais de ObjectURLs: Runtime novo e controlador legado;
- um Blob não deve ser registrado independentemente nos dois caminhos para o mesmo lifecycle.

Não alterado nesta PR. A consolidação deve ocorrer quando o TrackArea deixar de montar o controlador legado.

## 6. Caches

O Runtime possui caches separados para:

- `AudioBuffer` decodificado;
- waveform;
- ObjectURL.

Pontos positivos:

- `decodeAudio()` retorna buffer existente pelo `assetId`;
- remoção de asset limpa buffer e waveform;
- `dispose()` limpa todos os Maps.

Riscos:

- não existe limite LRU ou orçamento de memória;
- projetos com muitos áudios grandes mantêm todos os buffers decodificados enquanto a Session estiver viva;
- snapshots de ObjectURLs convertem Map para objeto, gerando cópia completa quando chamados.

Não foi implementado limite de cache porque eviction pode introduzir redecodificação durante playback e alterar latência. Recomenda-se instrumentar uso real antes de definir orçamento.

## 7. Otimizações aplicadas

### Session estável

Arquivo: `voice-studio-provider.tsx`

- Session deixa de ser recriada por mudança de `readOnly`;
- infraestrutura, caches e assinaturas permanecem estáveis.

### Lanes memoizadas

Arquivo: `voice-studio-timeline-view.tsx`

- `TimelineLane` usa `memo()`;
- ticks de playhead não reexecutam a árvore de clips quando as props de track permanecem estáveis.

### Waveform vazio compartilhado

Arquivo: `voice-studio-timeline-view.tsx`

- removida alocação repetida de 80 números para assets sem peaks.

## 8. Otimizações não aplicadas

Foram deliberadamente evitadas:

- throttling do playhead;
- redução da frequência de eventos;
- alteração do lookahead de áudio;
- pooling de AudioNodes;
- cache LRU de AudioBuffers;
- consolidação de `elapsed` com `project.view.playhead`;
- transformação em massa de funções para `useCallback`;
- mudanças na política de ObjectURLs;
- mudanças no scheduling MIDI/áudio.

Essas alterações podem afetar precisão, latência, UX ou lifecycle e exigem benchmark e testes de integração.

## 9. Próximas prioridades recomendadas

1. Migrar BottomTransport para Session/EventBus e retirar ticks do controlador legado.
2. Migrar TrackArea para ProjectActions e eliminar atualização completa do Project por playhead.
3. Adicionar instrumentação de contagem de renders em desenvolvimento.
4. Adicionar métricas de quantidade de AudioNodes ativos e buffers decodificados.
5. Implementar cleanup individual de MIDI nodes com testes de loop/stop.
6. Remover o segundo proprietário de ObjectURLs ao aposentar o controlador legado.
7. Avaliar cache LRU somente com dados de memória de projetos reais.

## Conclusão

As otimizações aplicadas reduzem trabalho repetido e preservam integralmente comportamento, scheduling, precisão e APIs públicas. Os maiores ganhos futuros dependem da remoção gradual do controlador legado; tentar micro-otimizá-lo agora aumentaria complexidade e risco sem resolver a causa principal dos renders amplos.
