const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Décode les entités HTML d'un texte venu d'une boîte mail (le `snippet` d'un
 * message arrive échappé). Un seul passage — `&amp;lt;` donne `&lt;`. Jamais
 * de `dangerouslySetInnerHTML` : le résultat reste du texte.
 */
export function decodeHtmlEntities<T extends string | null | undefined>(value: T): T {
  if (typeof value !== 'string') return value
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED[body.toLowerCase()] ?? match
  }) as T
}
