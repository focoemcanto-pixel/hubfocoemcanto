# Auditoria arquitetural — hubfocoemcanto

## Resumo executivo

O projeto utiliza Next.js, React, TypeScript, Supabase e OpenNext para Cloudflare. O ponto de maior concentração arquitetural confirmado nesta auditoria inicial é o Voice Studio, especialmente o componente `VoiceStudioDaw`, que hoje acumula responsabilidades de interface, estado, playback, gravação, MIDI, histórico, seleção, atalhos e integração com armazenamento.

A estratégia recomendada é evoluir por fases pequenas, preservando comportamento e contratos públicos. A primeira fase implementada nesta branch é deliberadamente conservadora: endurecimento dos contratos TypeScript do Recording Engine, sem alteração de lógica, layout, APIs ou comportamento.

## Achados confirmados

### Crítico

Nenhum problema crítico foi alterado nesta fase. Mudanças em fluxo de gravação, playback, persistência ou contratos públicos devem ser tratadas somente com cobertura de testes e validação de integração.

### Alto impacto

- `app/live/[slug]/voice-studio-daw.tsx` concentra múltiplos domínios no mesmo componente: estado do projeto, gravação, MIDI, playback, seleção, edição, histórico, atalhos e renderização.
- Grande quantidade de estados e refs no mesmo componente aumenta acoplamento e custo de manutenção.
- Funções de domínio e efeitos de ciclo de vida convivem com JSX extenso, dificultando testes isolados.
- O componente mantém CSS complementar em string inline, além do arquivo CSS dedicado.

### Médio impacto

- Tipos de entrada de funções do Recording Engine estavam declarados inline, dificultando reutilização e documentação dos contratos.
- Funções públicas do Recording Engine não possuíam retorno explícito em todos os casos.
- A lista de MIME types aceitava mutação acidental em tempo de compilação.
- Existem funções extensas em uma única linha, reduzindo legibilidade e dificultando revisão.
- Dependências do `package.json` usam `latest`, o que reduz reprodutibilidade de builds. Esse ponto não foi alterado nesta fase por risco de mudança indireta de comportamento.

### Baixo impacto

- Padronização de formatação e nomes de tipos pode melhorar leitura sem afetar runtime.
- Utilitários puros de MIDI, waveform e exportação são candidatos futuros à extração.

## Roadmap recomendado

### Fase 1 — Contratos e limites seguros

**Objetivo:** fortalecer tipagem e tornar contratos explícitos em módulos isolados.

**Arquivos iniciais:**
- `app/live/[slug]/voice-studio-recording-engine.ts`
- módulos puros adjacentes do Voice Studio

**Risco:** baixo.

**Benefícios:** melhor legibilidade, revisão mais segura, menor chance de uso incorreto e base para testes unitários.

### Fase 2 — Testes e reprodutibilidade

**Objetivo:** adicionar cobertura para engines puras e estabilizar versões de dependências.

**Arquivos envolvidos:**
- engines de project model, recording, selection, history, timeline e playback
- `package.json`
- lockfile e configuração de testes

**Risco:** baixo a médio.

**Benefícios:** proteção contra regressões e builds reproduzíveis.

### Fase 3 — Decomposição do Voice Studio

**Objetivo:** separar o componente principal por domínio, sem alterar interface.

**Arquivos envolvidos:**
- `voice-studio-daw.tsx`
- novos hooks/controllers de playback, recording, MIDI, history e keyboard shortcuts

**Risco:** médio a alto.

**Benefícios:** redução de acoplamento, componentes menores, testes isolados e manutenção mais segura.

### Fase 4 — Performance e ciclo de renderização

**Objetivo:** revisar dependências de efeitos, frequência de atualizações e estabilidade de callbacks.

**Arquivos envolvidos:**
- componente principal
- timeline
- hooks de playback e gravação

**Risco:** médio.

**Benefícios:** menos renderizações, menor carga durante gravação/playback e maior previsibilidade.

### Fase 5 — Áreas do aluno e administrativa

**Objetivo:** repetir a auditoria por domínio e padronizar acesso a dados, estados e contratos.

**Arquivos envolvidos:**
- rotas da área do aluno
- rotas administrativas
- APIs, utilitários e integrações Supabase relacionadas

**Risco:** variável por módulo.

**Benefícios:** escalabilidade, padronização e redução de dívida técnica transversal.

## Fase implementada nesta branch

Foram criados tipos nomeados para as entradas públicas do Recording Engine, adicionados retornos explícitos, tornada imutável a lista de MIME types e melhorada a formatação da captura de chunks.

Não houve alteração de:

- comportamento da gravação;
- interface visual;
- contratos públicos existentes;
- nomes das funções exportadas;
- estrutura do projeto persistido;
- fluxo de playback;
- APIs externas.

## Próxima etapa sugerida

Adicionar testes unitários para `voice-studio-recording-engine.ts` e demais engines puras antes de decompor `VoiceStudioDaw`. Essa sequência cria uma rede de segurança real antes de qualquer refatoração estrutural de maior porte.
