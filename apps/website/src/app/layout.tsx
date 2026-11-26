import type { ReactNode } from 'react'

/**
 * Pass-through root layout. The real `<html>`/`<body>` shell lives in
 * `app/[locale]/layout.tsx` (locale-aware `lang`, i18n provider, metadata);
 * `app/not-found.tsx` renders its own shell. Next.js still requires this file
 * to exist whenever a root `not-found.tsx` is present.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
