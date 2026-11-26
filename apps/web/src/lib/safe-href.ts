/**
 * Neutralises dangerous URL schemes (`javascript:`, `data:`, `vbscript:`, …)
 * before they reach an anchor `href`.
 *
 * Contact/company URLs (`linkedin_url`, `website`) come from CSV import and web
 * scraping — attacker-influenceable — and React does NOT block `javascript:` in
 * `href`. An unvalidated `href={url}` is therefore a stored-XSS / session-riding
 * vector, including on the unauthenticated public share page. Passing the value
 * through `safeHref` returns `undefined` for anything that isn't a plain http(s)
 * (or opt-in `mailto:`/`tel:`) URL, so the anchor renders inert instead of
 * executing script when clicked.
 */
export function safeHref(url: string | null | undefined, opts?: { allowMailtoTel?: boolean }): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (!trimmed) return undefined
  try {
    // Resolve against the current origin so relative URLs keep working; absolute
    // URLs retain their own scheme, which we then whitelist.
    const parsed = new URL(trimmed, window.location.origin)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return trimmed
    if (opts?.allowMailtoTel && (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:')) return trimmed
    return undefined
  } catch {
    return undefined
  }
}
