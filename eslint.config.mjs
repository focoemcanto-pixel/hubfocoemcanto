import nextVitals from 'eslint-config-next/core-web-vitals';

const ignores = [
  '.next/**',
  'node_modules/**',
  'dist/**',
  'out/**',
  'cloudflare-env.d.ts',
  'next-env.d.ts',
];

const projectCompatibilityRules = {
  '@next/next/no-html-link-for-pages': 'off',
  '@next/next/no-assign-module-variable': 'off',
  'react-hooks/set-state-in-effect': 'off',
  'react-hooks/purity': 'off',
  'react-hooks/immutability': 'off',
  'react-hooks/refs': 'off',
  'react-hooks/use-memo': 'off',
};

const config = [
  { ignores },
  ...nextVitals,
  { rules: projectCompatibilityRules },
];

export default config;
