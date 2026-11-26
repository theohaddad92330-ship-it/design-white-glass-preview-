import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #2271.16/.19 (recette écran PRODUCTION du 18/09/2026, `7b9083854`, compte
 * THALES) — UN HORODATAGE ISO NE PART JAMAIS BRUT VERS L'ÉCRAN.
 *
 * Mesuré : dans une réponse de Laura, une puce affichait
 * « 2026-09-17T11:01:14Z » tel quel — une date pour une machine, pas pour un
 * commercial. La même famille existait déjà, sans garde, dans
 * `TimelineCard.tsx` (#2271.19) : `event.at` — l'horodatage ISO complet que le
 * contrat exige (`reply-blocks.ts:114`, `isoDateTime`) — sortait BRUT dès que
 * `new Date(event.at)` échouait à le lire (un jour de calendrier impossible,
 * ex. 30 février, passe la regex du contrat mais pas `Date`), et la même carte
 * appelait `.toLocaleDateString(language)` À LA MAIN plutôt que la primitive
 * du front (`formatDate`, `@/lib/locale`, GA-26 : une dérivation « date
 * lisible » vit à UN seul endroit — déjà établi pour `Provenance`, voir
 * `provenance-date-is-formatted-once.test.ts`).
 *
 * Cette garde tient ce que le correctif établit pour les CARTES DE RÉPONSE
 * (`features/chat/view/reply-blocks`, ce que Laura rend dans le fil) : aucun
 * champ temporel (`.at`, `.as_of`, `.asOf`, `.created_at`, `.updated_at`,
 * `.fetched_at`) ne s'affiche brut dans un morceau de JSX — soit il est passé
 * à un formateur (`formatDate(…)`, `formatAsOf(…)`), soit il n'apparaît pas
 * du tout en clair.
 */

const racineReplyBlocks = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'features',
  'chat',
  'view',
  'reply-blocks',
)

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) {
      sortie.push(...fichiersSous(chemin))
      continue
    }
    if (!entree.endsWith('.tsx') || entree.includes('.test.')) continue
    sortie.push(chemin)
  }
  return sortie
}

/** Une propriété temporelle (`.at`, `.as_of`…) juste après `?` ou `:` — la
 *  branche d'un ternaire — SANS parenthèse à la suite : pas un appel de
 *  formateur, la valeur brute elle-même. */
const APRES_TERNAIRE = /[?:]\s*[A-Za-z_$][\w]*\.(?:at|as_of|asOf|created_at|updated_at|fetched_at)\b(?!\s*\()/

/** La même propriété, SEULE dans une expression JSX — `{x.at}`. */
const SEULE_DANS_JSX = /\{\s*[A-Za-z_$][\w]*\.(?:at|as_of|asOf|created_at|updated_at|fetched_at)\s*\}/

const DATE_BRUTE = new RegExp(`(?:${APRES_TERNAIRE.source})|(?:${SEULE_DANS_JSX.source})`)

describe('un champ temporel des cartes de Laura ne s’affiche jamais brut', () => {
  const sources = fichiersSous(racineReplyBlocks)

  it('a un corpus à lire — une garde qui ne lit rien ne garde rien', () => {
    expect(sources.length).toBeGreaterThan(5)
    expect(sources.some(f => f.endsWith('TimelineCard.tsx'))).toBe(true)
  })

  it('aucune carte n’affiche un horodatage ISO sans le faire passer par un formateur', () => {
    const coupables = sources
      .filter(f => DATE_BRUTE.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(racineReplyBlocks.length + 1))

    expect(coupables).toEqual([])
  })

  it('sait dire NON — les lignes réellement mesurées en prod sont reconnues', () => {
    expect(DATE_BRUTE.test('{Number.isNaN(when.getTime()) ? event.at : when.toLocaleDateString(language)}')).toBe(true)
    expect(DATE_BRUTE.test('<Text>{event.at}</Text>')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une valeur déjà formatée passe', () => {
    expect(DATE_BRUTE.test("{formatDate(event.at) ?? t('blocks.dateUnreadable')}")).toBe(false)
    // Un `.at()` de tableau (méthode, jamais une propriété) n'est pas visé.
    expect(DATE_BRUTE.test('{items.at(-1)}')).toBe(false)
    // Une date déjà humanisée par un formateur dédié n'est pas visée.
    expect(DATE_BRUTE.test("{date ? `· ${date}` : ''}")).toBe(false)
  })
})
