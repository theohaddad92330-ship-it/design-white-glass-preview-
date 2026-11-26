/**
 * Les échéances RELATIVES du plan d'action (`J+1`, `S+5`, `M+3S+2`).
 *
 * Le pipeline écrit `deadline` en jeton relatif — « un jour après le plan »,
 * « cinq semaines après le plan » — et non en date calendaire, parce qu'un plan
 * se produit une fois et se lit longtemps. Le jeton est donc VRAI et exploitable
 * ; ce qui ne l'est pas, c'est de le donner à `new Date()`.
 *
 * ⚠️ Le parseur de dates de V8 est PERMISSIF : `new Date('J+10')` rend le
 * 1ᵉʳ octobre **2001** et `new Date('J+3')` le 1ᵉʳ mars 2001 — une date d'allure
 * plausible dont seule l'ANNÉE trahit l'invention. `J+14` et `M+3S+2`, eux,
 * rendent `Invalid Date`. Les deux sorties sont inacceptables : on ne montre
 * jamais une date qu'on n'a pas calculée.
 *
 * D'où les trois règles de ce module :
 *
 * 1. **la base est un PARAMÈTRE.** Un `Date.now()` en dur rendrait le calcul
 *    dépendant de l'horloge — et le test avec lui (leçon de l'évaluation RAG :
 *    « une évaluation qui ne peut pas faire bouger ce qu'elle mesure ne mesure
 *    rien ») ;
 * 2. **un jeton illisible rend `null`.** Jamais une date, jamais `Invalid
 *    Date`. L'appelant affiche alors le jeton tel quel, ou l'horizon en clair
 *    ({@link relativeDeadlineDays}) — ce qui est VRAI et utile ;
 * 3. **une base illisible rend `null` aussi.** « J+10 » sans savoir de quand
 *    est un horizon, pas une date.
 */

/** Un jeton relatif décomposé. Les trois unités s'additionnent (`M+3S+2`). */
export type RelativeDeadline = {
  months: number
  weeks: number
  days: number
}

/** Borne de bon sens : au-delà, ce n'est plus une échéance de plan de compte
 *  mais un nombre saisi de travers — on refuse plutôt que de projeter en 2140. */
const MAX_UNIT = 240

/** `J`/`D` = jour · `S`/`W` = semaine · `M` = mois. Les lettres anglaises sont
 *  acceptées parce que le pipeline tourne aussi sur des dossiers anglophones ;
 *  `M` vaut « mois » dans les deux langues. */
const UNIT_KEYS = { j: 'days', d: 'days', s: 'weeks', w: 'weeks', m: 'months' } as const

const TOKEN = /([jdswm])\s*\+\s*(\d{1,3})/gi

/**
 * Décompose un jeton relatif, ou rend `null`.
 *
 * Strict par construction : la chaîne doit être ENTIÈREMENT faite de jetons
 * (« J+3 puis relancer » est refusé — la partie en prose changerait le sens), et
 * une unité ne peut apparaître qu'une fois (« J+1J+2 » ne veut rien dire de sûr).
 */
export function parseRelativeDeadline(value: string | null | undefined): RelativeDeadline | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (raw.length === 0) return null

  const parsed: RelativeDeadline = { months: 0, weeks: 0, days: 0 }
  const seen = new Set<keyof RelativeDeadline>()
  let consumed = 0

  // `RegExp.test`/`exec` avec le drapeau `g` est STATEFUL : l'expression est
  // recréée ici plutôt que partagée, sinon un appel sur deux repartirait du
  // milieu de la chaîne précédente.
  const scanner = new RegExp(TOKEN.source, 'gi')
  for (let hit = scanner.exec(raw); hit !== null; hit = scanner.exec(raw)) {
    const letter = (hit[1] ?? '').toLowerCase() as keyof typeof UNIT_KEYS
    const unit = UNIT_KEYS[letter]
    if (seen.has(unit)) return null
    const amount = Number(hit[2])
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_UNIT) return null
    seen.add(unit)
    parsed[unit] = amount
    consumed += (hit[0] ?? '').length
  }

  if (seen.size === 0) return null
  // Tout ce qui n'est pas un jeton doit être du blanc : sinon la chaîne dit
  // autre chose que ce qu'on vient d'en lire.
  const separators = raw.length - consumed
  if (separators > 0 && raw.replace(scanner, '').trim().length > 0) return null
  return parsed
}

/**
 * L'horizon du jeton en JOURS, pour le dire en clair (« sous 10 jours ») quand
 * aucune base fiable n'existe. Un mois y vaut 30 jours : c'est une
 * approximation ASSUMÉE, réservée à une phrase — jamais à une date posée.
 */
export function relativeDeadlineDays(value: string | null | undefined): number | null {
  const parsed = parseRelativeDeadline(value)
  if (!parsed) return null
  return parsed.months * 30 + parsed.weeks * 7 + parsed.days
}

/**
 * Le jeton résolu en date calendaire `YYYY-MM-DD`, relativement à `base`.
 *
 * `base` est la date qui a PRODUIT le plan (l'analyse), pas aujourd'hui :
 * « J+1 » veut dire « le lendemain du plan ». Calé sur l'horloge de lecture, le
 * même « J+1 » resterait « demain » six mois plus tard — c'est-à-dire l'inverse
 * de ce qu'une échéance affirme.
 *
 * Les mois sont ajoutés en CALENDAIRE et bornés au dernier jour du mois
 * d'arrivée : `setMonth` seul fait déborder le 31 janvier sur le 3 mars.
 */
export function resolveRelativeDeadline(
  value: string | null | undefined,
  base: Date | null | undefined,
): string | null {
  const parsed = parseRelativeDeadline(value)
  if (!parsed) return null
  if (!(base instanceof Date) || Number.isNaN(base.getTime())) return null

  // Tout se calcule en UTC : une base prise à minuit local un jour de
  // changement d'heure glisserait d'une journée.
  const year = base.getUTCFullYear()
  const month = base.getUTCMonth()
  const day = base.getUTCDate()

  const target = new Date(Date.UTC(year, month + parsed.months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  target.setUTCDate(target.getUTCDate() + parsed.weeks * 7 + parsed.days)

  return target.toISOString().slice(0, 10)
}

/**
 * `true` seulement pour une date calendaire ISO qui EXISTE (`2026-02-29` n'en
 * est pas une). C'est le seul filtre qui autorise un `new Date(...)` en aval :
 * il ferme la porte au parseur permissif de V8, qui accepte « Fri Aug 29 » —
 * la forme exacte qui affichait les rappels d'équipe en 2001.
 */
export function isCalendarDate(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
