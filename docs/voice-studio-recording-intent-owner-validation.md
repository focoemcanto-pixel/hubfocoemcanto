# Validation checklist

The following commands were not executed inside ChatGPT and must run in CI or locally:

```bash
npm install
npm run test:run
npm run test:coverage
npm run lint
npm run build
npx opennextjs-cloudflare build
```
