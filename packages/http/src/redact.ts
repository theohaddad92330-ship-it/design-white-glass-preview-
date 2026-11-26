/**
 * #4120 — masquage des secrets dans un corps d'erreur avant de le mettre dans une erreur ou un log.
 * Le masquage précède la troncature : un secret coupé en deux par la limite resterait à moitié lisible.
 */
const MASK = '***'

const PATTERNS: Array<[RegExp, string]> = [
  // `Authorization: Bearer xxx`, `Bearer xxx`, `"authorization":"Basic xxx"`
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${MASK}`],
  // en-têtes d'authentification, en texte (`X-Internal-Secret: v`) ou JSON (`"x-internal-secret":"v"`)
  [
    /((?:authorization|proxy-authorization|x-internal-[\w-]*|x-api-key|api-key|cookie|set-cookie)["']?\s*[:=]\s*["']?)[^\s"',;}&]+/gi,
    `$1${MASK}`,
  ],
  // `api_key=...`, `apikey: ...`, `token=...`, `secret=...`, `password=...`, `access_token`, `client_secret`
  [
    /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|token|password|passwd)["']?\s*[:=]\s*["']?)[^\s"',;}&]+/gi,
    `$1${MASK}`,
  ],
  // clés de type `sk-...`, `sk-ant-...`
  [/\bsk-[A-Za-z0-9_-]{8,}/g, MASK],
]

export function redactSecrets(text: string): string {
  let out = text
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement)
  return out
}
