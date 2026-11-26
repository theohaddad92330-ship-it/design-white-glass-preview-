import reactConfig from '@bellum/tooling/eslint/react'

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...reactConfig,
  {
    // Next.js App Router files (page.tsx, layout.tsx, sitemap.ts, robots.ts)
    // export `metadata`, `viewport`, `default`, etc. by design. The Vite-oriented
    // react-refresh rule from the shared config doesn't apply here.
    files: ['src/app/**/page.tsx', 'src/app/**/layout.tsx', 'src/app/**/sitemap.ts', 'src/app/**/robots.ts'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
]
