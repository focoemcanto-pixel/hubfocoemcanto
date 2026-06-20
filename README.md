# Hub Foco em Canto

App do Grupo VIP Foco em Harmonia.

## Stack

- Next.js App Router
- Supabase Auth, Database e Storage
- Cloudflare Workers com OpenNext

## Desenvolvimento

```bash
npm install
npm run dev
```

## Preview em runtime Cloudflare

```bash
npm run preview
```

## Deploy

```bash
npm run deploy
```

No painel da Cloudflare, use:

- Build command: `npm install`
- Deploy command: `npm run deploy`

## Variáveis obrigatórias

```env
NEXT_PUBLIC_APP_URL=https://hub.focoemcanto.com
NEXT_PUBLIC_SUPABASE_URL=https://jmhqdvracyjxqubqfgiz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
KIWIFY_WEBHOOK_SECRET=
```

## Rotas principais

- `/login`
- `/cadastro`
- `/aluno`
- `/aluno/trilhas`
- `/aluno/enviar`
- `/aluno/comunidade`
- `/aluno/perfil`
- `/admin`
- `/api/kiwify/webhook`
