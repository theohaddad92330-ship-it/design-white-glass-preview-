import './globals.css'

/**
 * Global fallback for requests that never reach a locale segment. The localized
 * 404 lives in `app/[locale]/not-found.tsx`; this only renders in edge cases and
 * must therefore provide its own `<html>`/`<body>`.
 */
export default function GlobalNotFound() {
  return (
    <html lang="fr" className="dark">
      <body>
        <main
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            background: '#06070e',
            color: '#fff',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            padding: '24px',
          }}
        >
          <h1 style={{ fontSize: '48px', margin: 0 }}>404</h1>
          <p style={{ color: '#a1a1aa', margin: 0 }}>Page introuvable — Page not found.</p>
          <a href="/" style={{ color: '#a78bfa', textDecoration: 'none' }}>
            BellumAI
          </a>
        </main>
      </body>
    </html>
  )
}
