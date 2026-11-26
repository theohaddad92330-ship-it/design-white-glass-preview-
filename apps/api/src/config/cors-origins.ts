const DEVELOPMENT_ORIGINS = ['http://localhost:5173'] as const

/**
 * Parses FRONTEND_URL into the list of allowed browser origins.
 *
 * Accepts a single origin or a comma-separated list, so the SPA can be served
 * from more than one host during a domain migration (e.g. bellum-ai.com and
 * app.bellum-ai.com) without a CORS outage. Entries are trimmed, empties are
 * dropped and duplicates are removed.
 */
function frontendOrigins(): string[] {
  const raw = process.env['FRONTEND_URL']
  if (!raw) return []
  return [
    ...new Set(
      raw
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
    ),
  ]
}

/** `http://localhost:PORT` / `http://127.0.0.1:PORT` (any port, http only). */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin)
    return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')
  } catch {
    return false
  }
}

export function getAllowedCorsOrigins(): string[] {
  if (process.env['NODE_ENV'] === 'production') {
    return frontendOrigins()
  }

  // Outside production, FRONTEND_URL may add EXTRA LOOPBACK origins only, so a
  // second stack (worktree, or Vite falling back to 5174/5175 when 5173 is
  // taken) can reach its own API without a CORS outage.
  //
  // Remote origins from FRONTEND_URL stay rejected on purpose: a dev API must
  // never be callable from a deployed site the developer happens to visit.
  return [...new Set([...DEVELOPMENT_ORIGINS, ...frontendOrigins().filter(isLoopbackOrigin)])]
}
